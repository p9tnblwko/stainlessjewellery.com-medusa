import { readFile } from "fs/promises"
import path from "path"

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

type ProductRecord = {
  id: string
  handle?: string | null
  title?: string | null
}

type ProductGeneratedContentUpdate = {
  id?: string
  handle?: string
  title: string
  subtitle: string
  description: string
}

type ProductWorkflowUpdate = {
  id: string
  title: string
  subtitle: string
  description: string
}

type ScriptOptions = {
  batchSize: number
  csvPath: string
  dryRun: boolean
  limit?: number
}

const DEFAULT_BATCH_SIZE = 100
const DEFAULT_CSV_PATH = "./src/scripts/products_with_generated_content_v3.csv"

const COLUMN_ALIASES = {
  id: ["Product Id", "Product ID", "id"],
  handle: ["Product Handle", "handle"],
  title: ["New Title", "new title"],
  subtitle: [
    "New Meta Description",
    "new meta description",
    "new meta descripton",
  ],
  description: ["New Description HTML", "new description HTML"],
}

function parsePositiveInteger(value?: string) {
  const parsed = Number.parseInt(value || "", 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function parseOptions(args: string[] = []): ScriptOptions {
  const options: ScriptOptions = {
    batchSize: DEFAULT_BATCH_SIZE,
    csvPath: path.resolve(
      process.cwd(),
      process.env.GENERATED_CONTENT_CSV || DEFAULT_CSV_PATH
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

function columnIndex(header: string[], aliases: string[]) {
  const normalizedHeader = header.map((column) => column.trim().toLowerCase())

  for (const alias of aliases) {
    const index = normalizedHeader.indexOf(alias.toLowerCase())

    if (index >= 0) {
      return index
    }
  }

  return -1
}

function getRequiredColumnIndexes(header: string[]) {
  const indexes = {
    id: columnIndex(header, COLUMN_ALIASES.id),
    handle: columnIndex(header, COLUMN_ALIASES.handle),
    title: columnIndex(header, COLUMN_ALIASES.title),
    subtitle: columnIndex(header, COLUMN_ALIASES.subtitle),
    description: columnIndex(header, COLUMN_ALIASES.description),
  }
  const missing = Object.entries(indexes)
    .filter(([, index]) => index < 0)
    .map(([key]) => key)

  if (missing.length) {
    throw new Error(
      `Missing required CSV columns: ${missing.join(", ")}. Header: ${header.join(
        ", "
      )}`
    )
  }

  return indexes
}

function isSameUpdate(
  left: ProductGeneratedContentUpdate,
  right: ProductGeneratedContentUpdate
) {
  return (
    left.title === right.title &&
    left.subtitle === right.subtitle &&
    left.description === right.description
  )
}

async function readUpdates(csvPath: string, limit?: number) {
  const csv = await readFile(csvPath, "utf8")
  const rows = parseCsv(csv)
  const header = rows[0] ?? []
  const indexes = getRequiredColumnIndexes(header)
  const updatesByKey = new Map<string, ProductGeneratedContentUpdate>()
  const conflicts: string[] = []
  let skipped = 0

  for (const row of rows.slice(1)) {
    const id = row[indexes.id]?.trim()
    const handle = row[indexes.handle]?.trim()
    const update: ProductGeneratedContentUpdate = {
      id: id || undefined,
      handle: handle || undefined,
      title: row[indexes.title]?.trim() ?? "",
      subtitle: row[indexes.subtitle]?.trim() ?? "",
      description: row[indexes.description]?.trim() ?? "",
    }
    const key = update.id || update.handle

    if (!key || !update.title || !update.subtitle || !update.description) {
      skipped += 1
      continue
    }

    const existing = updatesByKey.get(key)

    if (existing && !isSameUpdate(existing, update)) {
      conflicts.push(key)
    }

    updatesByKey.set(key, update)

    if (limit && updatesByKey.size >= limit) {
      break
    }
  }

  return {
    updates: [...updatesByKey.values()],
    conflicts: [...new Set(conflicts)],
    skipped,
    rowCount: Math.max(rows.length - 1, 0),
  }
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }

  return result
}

async function resolveUpdatesByHandle(
  productService: any,
  updates: ProductGeneratedContentUpdate[]
): Promise<ProductWorkflowUpdate[]> {
  const updatesWithIds = updates.filter(
    (update): update is ProductGeneratedContentUpdate & { id: string } =>
      Boolean(update.id)
  )
  const updatesWithoutIds = updates.filter((update) => !update.id)

  if (!updatesWithoutIds.length) {
    return updatesWithIds
  }

  const products = (await productService.listProducts(
    {
      handle: updatesWithoutIds
        .map((update) => update.handle)
        .filter((handle): handle is string => Boolean(handle)),
    },
    {
      select: ["id", "handle", "title"],
      take: updatesWithoutIds.length,
    }
  )) as ProductRecord[]
  const productsByHandle = new Map(
    products
      .filter((product) => product.handle)
      .map((product) => [product.handle as string, product])
  )
  const resolved = updatesWithoutIds.flatMap((update) => {
    const product = update.handle ? productsByHandle.get(update.handle) : undefined

    return product
      ? [
          {
            id: product.id,
            title: update.title,
            subtitle: update.subtitle,
            description: update.description,
          },
        ]
      : []
  })

  return [...updatesWithIds, ...resolved]
}

export default async function updateProductsGeneratedContent({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any
  const options = parseOptions(args)
  const { updates, conflicts, skipped, rowCount } = await readUpdates(
    options.csvPath,
    options.limit
  )

  let updated = 0

  logger.info(`CSV: ${options.csvPath}`)
  logger.info(`Rows read: ${rowCount}`)
  logger.info(`Updates selected: ${updates.length}`)
  logger.info(`Rows skipped: ${skipped}`)
  logger.info(`Duplicate conflicts: ${conflicts.length}`)
  logger.info(`Dry run: ${options.dryRun ? "yes" : "no"}`)

  if (conflicts.length) {
    logger.warn(
      `Found conflicting duplicate generated content for ${conflicts.length} products. Last row wins. First 20: ${conflicts
        .slice(0, 20)
        .join(", ")}`
    )
  }

  for (const updateBatch of chunks(updates, options.batchSize)) {
    const workflowUpdates = await resolveUpdatesByHandle(
      productService,
      updateBatch
    )

    for (const update of workflowUpdates.slice(0, 10)) {
      logger.info(
        `${options.dryRun ? "[dry-run] " : ""}${update.id}: ${update.title}`
      )
    }

    if (workflowUpdates.length > 10) {
      logger.info(
        `${options.dryRun ? "[dry-run] " : ""}...and ${
          workflowUpdates.length - 10
        } more in this batch`
      )
    }

    if (workflowUpdates.length && !options.dryRun) {
      await updateProductsWorkflow(container).run({
        input: {
          products: workflowUpdates,
        },
      })

      updated += workflowUpdates.length
      logger.info(`Updated ${workflowUpdates.length} products in this batch.`)
    } else {
      updated += workflowUpdates.length
    }
  }

  logger.info(
    `Done. ${options.dryRun ? "Would update" : "Updated"} ${updated} products.`
  )
}
