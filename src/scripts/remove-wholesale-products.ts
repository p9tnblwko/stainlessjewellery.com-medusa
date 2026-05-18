import { readFile } from "fs/promises"
import path from "path"

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

type ProductRecord = {
  id: string
  handle?: string | null
  title?: string | null
}

type ScriptOptions = {
  batchSize: number
  csvPath: string
  dryRun: boolean
  limit?: number
}

const DEFAULT_BATCH_SIZE = 100
const DEFAULT_CSV_PATH = "./src/scripts/wholesale_products_to_remove.csv"
const HANDLE_COLUMN_NAMES = ["Product Handle", "handle", "Handle", "handler"]

function parsePositiveInteger(value?: string) {
  const parsed = Number.parseInt(value || "", 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function parseOptions(args: string[] = []): ScriptOptions {
  const options: ScriptOptions = {
    batchSize: DEFAULT_BATCH_SIZE,
    csvPath: path.resolve(
      process.cwd(),
      process.env.WHOLESALE_PRODUCTS_CSV || DEFAULT_CSV_PATH
    ),
    dryRun: process.env.DRY_RUN !== "false",
  }

  for (const rawArg of args) {
    const arg = rawArg.replace(/^--/, "")
    const [key, value] = arg.includes("=") ? arg.split("=", 2) : [arg, ""]

    if (key === "batch-size" && value) {
      options.batchSize = parsePositiveInteger(value) ?? options.batchSize
    }

    if (key === "csv" && value) {
      options.csvPath = path.resolve(process.cwd(), value)
    }

    if (key === "limit" && value) {
      options.limit = parsePositiveInteger(value)
    }

    if (key === "apply") {
      options.dryRun = false
    }

    if (key === "dry-run" || key === "dryRun") {
      options.dryRun = value ? value !== "false" : true
    }
  }

  return options
}

function parseCsv(input: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let index = 0; index < input.length; index++) {
    const char = input[index]
    const next = input[index + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        index++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }

      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (char !== "\r") {
      field += char
    }
  }

  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

function findHandleColumnIndex(header: string[]) {
  const normalizedHeader = header.map((column) => column.trim().toLowerCase())

  for (const columnName of HANDLE_COLUMN_NAMES) {
    const index = normalizedHeader.indexOf(columnName.toLowerCase())

    if (index >= 0) {
      return index
    }
  }

  return -1
}

async function readProductHandles(csvPath: string) {
  const csv = await readFile(csvPath, "utf8")
  const rows = parseCsv(csv)
  const header = rows[0] ?? []
  const handleColumnIndex = findHandleColumnIndex(header)

  if (handleColumnIndex < 0) {
    throw new Error(
      `Could not find a product handle column in ${csvPath}. Expected one of: ${HANDLE_COLUMN_NAMES.join(
        ", "
      )}`
    )
  }

  const seen = new Set<string>()
  const handles: string[] = []

  for (const row of rows.slice(1)) {
    const handle = row[handleColumnIndex]?.trim()

    if (!handle || seen.has(handle)) {
      continue
    }

    seen.add(handle)
    handles.push(handle)
  }

  return handles
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }

  return result
}

export default async function removeWholesaleProducts({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any
  const options = parseOptions(args)
  const allHandles = await readProductHandles(options.csvPath)
  const handles = options.limit ? allHandles.slice(0, options.limit) : allHandles

  let matched = 0
  let deleted = 0
  let missing = 0

  logger.info(`CSV: ${options.csvPath}`)
  logger.info(`Handles from CSV: ${allHandles.length}`)
  logger.info(`Handles selected: ${handles.length}`)
  logger.info(`Dry run: ${options.dryRun ? "yes" : "no"}`)

  for (const handleBatch of chunks(handles, options.batchSize)) {
    const products = (await productService.listProducts(
      { handle: handleBatch },
      {
        select: ["id", "handle", "title"],
        take: handleBatch.length,
      }
    )) as ProductRecord[]
    const productsByHandle = new Map(
      products
        .filter((product) => product.handle)
        .map((product) => [product.handle as string, product])
    )
    const batchProductIds = products.map((product) => product.id)

    matched += products.length
    missing += handleBatch.filter((handle) => !productsByHandle.has(handle)).length

    for (const handle of handleBatch) {
      const product = productsByHandle.get(handle)

      if (!product) {
        logger.warn(`Missing product for handle: ${handle}`)
        continue
      }

      logger.info(
        `${options.dryRun ? "[dry-run] " : ""}${product.handle}: ${
          product.title ?? product.id
        } (${product.id})`
      )
    }

    if (batchProductIds.length && !options.dryRun) {
      await deleteProductsWorkflow(container).run({
        input: {
          ids: batchProductIds,
        },
      })

      deleted += batchProductIds.length
      logger.info(`Deleted ${batchProductIds.length} products in this batch.`)
    }
  }

  logger.info(
    `Done. Matched ${matched}/${handles.length} handles. ${
      options.dryRun ? "Would delete" : "Deleted"
    } ${options.dryRun ? matched : deleted} products. Missing ${missing}.`
  )
}
