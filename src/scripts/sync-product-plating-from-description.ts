import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { PRODUCT_CUSTOM_FIELD_MODULE } from "../modules/product-custom-field"

type ScriptOptions = {
  batchSize: number
  limit?: number
  dryRun: boolean
}

type ProductRecord = {
  id: string
  title?: string | null
  handle?: string | null
  description?: string | null
}

type ProductCustomFieldRecord = {
  id: string
  product_id: string
  plating?: string[] | null
}

const DEFAULT_BATCH_SIZE = 500
const EMPTY_VALUES = new Set(["", "unknown", "n/a", "na", "none", "null"])

const PLATING_ALIASES: Array<[RegExp, string]> = [
  [/\btwo[\s-]*tone\s+ip\s+gold\b/i, "Two Tone Gold"],
  [/\btwo[\s-]*tone\s+gold\b/i, "Two Tone Gold"],
  [/\btwo[\s-]*tone\s+ip\s+black\b/i, "Two Tone Black"],
  [/\btwo[\s-]*tone\s+black\b/i, "Two Tone Black"],
  [/\btwo[\s-]*tone\s+ip\s+blue\b/i, "Two Tone Blue"],
  [/\btwo[\s-]*tone\s+blue\b/i, "Two Tone Blue"],
  [/\bip\s+rose\s+gold\b/i, "Rose Gold"],
  [/\brose\s+gold\b/i, "Rose Gold"],
  [/\bimitation\s+rhodium\b/i, "Rhodium"],
  [/\brhodium[\s-]*plated\b/i, "Rhodium"],
  [/\brhodium\b/i, "Rhodium"],
  [/\b14k\s+gold\s+plating\b/i, "Gold"],
  [/\bip\s+gold\s+plated\b/i, "Gold"],
  [/\bip\s+gold\b/i, "Gold"],
  [/\bflash\s+gold\b/i, "Gold"],
  [/\bgold[\s-]*plated\b/i, "Gold"],
  [/\bgold\b/i, "Gold"],
  [/\bip\s+black\b/i, "Black"],
  [/\bblack[\s-]*plated\b/i, "Black"],
  [/\bantique\s+tone\b/i, "Antique"],
  [/\bantique\b/i, "Antique"],
  [/\bhigh\s+polished\s*\(\s*no\s+plating\s*\)/i, "No Plating"],
  [/\bhigh\s+polished\b/i, "No Plating"],
  [/\bno\s+plating\b/i, "No Plating"],
  [/без\s+вказівки/i, "No Plating"],
]

function parseOptions(args: string[] = []): ScriptOptions {
  const normalizedArgs = args.map((arg) => arg.replace(/^--/, ""))
  const options: ScriptOptions = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: process.env.DRY_RUN === "true",
  }

  for (const arg of normalizedArgs) {
    const [key, value] = arg.includes("=") ? arg.split("=", 2) : [arg, ""]

    if (key === "batch-size" && value) {
      const batchSize = Number.parseInt(value, 10)

      if (Number.isInteger(batchSize) && batchSize > 0) {
        options.batchSize = batchSize
      }
    }

    if (key === "limit" && value) {
      const limit = Number.parseInt(value, 10)

      if (Number.isInteger(limit) && limit > 0) {
        options.limit = limit
      }
    }

    if (key === "dry-run" || key === "dryRun") {
      options.dryRun = value ? value !== "false" : true
    }
  }

  return options
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|h[1-6]|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizePlating(value?: string | null): string | null {
  if (!value) {
    return null
  }

  const normalized = decodeHtmlEntities(value)
    .replace(/\bion[\s-]*plated\b/gi, "plated")
    .replace(/[.;,:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (EMPTY_VALUES.has(normalized.toLowerCase())) {
    return null
  }

  for (const [pattern, plating] of PLATING_ALIASES) {
    if (pattern.test(normalized)) {
      return plating
    }
  }

  return null
}

function extractFinish(description?: string | null): string | null {
  if (!description) {
    return null
  }

  const finishLabelMatch = description.match(
    /(?:<strong>\s*)?Finish\s*:\s*(?:<\/strong>\s*)?([^<\n\r]+)/i
  )
  const platingFromLabel = normalizePlating(finishLabelMatch?.[1])

  if (platingFromLabel) {
    return platingFromLabel
  }

  const text = stripHtml(description)
  const textLabelMatch = text.match(
    /(?:^|\s)Finish\s*:\s*([^:]+?)(?:\s+[A-Z][A-Za-z ]+\s*:|$)/i
  )
  const platingFromTextLabel = normalizePlating(textLabelMatch?.[1])

  if (platingFromTextLabel) {
    return platingFromTextLabel
  }

  const craftedWithFinishMatch = text.match(
    /crafted\s+from\s+.+?\s+with\s+(?:a|an)\s+(.+?)\s+finish(?:[.,]|$)/i
  )
  const platingFromCraftedText = normalizePlating(craftedWithFinishMatch?.[1])

  if (platingFromCraftedText) {
    return platingFromCraftedText
  }

  return normalizePlating(text)
}

function valuesEqual(left?: string[] | null, right?: string[] | null) {
  const normalizedLeft = [...new Set(left || [])].sort()
  const normalizedRight = [...new Set(right || [])].sort()

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  )
}

export default async function syncProductPlatingFromDescription({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any
  const customFieldService = container.resolve(PRODUCT_CUSTOM_FIELD_MODULE) as any
  const options = parseOptions(args)
  let scanned = 0
  let detected = 0
  let missing = 0
  let created = 0
  let updated = 0
  let unchanged = 0
  let totalProducts = 0
  const platingCounts = new Map<string, number>()

  logger.info("Scanning product descriptions and syncing product plating...")
  logger.info(`Dry run: ${options.dryRun ? "yes" : "no"}`)

  for (let offset = 0; ; offset += options.batchSize) {
    const remaining = options.limit ? options.limit - scanned : undefined

    if (remaining !== undefined && remaining <= 0) {
      break
    }

    const take =
      remaining === undefined
        ? options.batchSize
        : Math.min(options.batchSize, remaining)
    const [products, count] = (await productService.listAndCountProducts(
      {},
      {
        select: ["id", "title", "handle", "description"],
        skip: offset,
        take,
      }
    )) as [ProductRecord[], number]

    totalProducts = options.limit ? Math.min(count, options.limit) : count

    if (!products.length) {
      break
    }

    const detectedProducts = products
      .map((product) => ({
        product,
        plating: extractFinish(product.description),
      }))
      .filter(
        (item): item is { product: ProductRecord; plating: string } =>
          Boolean(item.plating)
      )
    const existingRecords = detectedProducts.length
      ? ((await customFieldService.listProductCustomFields({
          product_id: detectedProducts.map(({ product }) => product.id),
        })) as ProductCustomFieldRecord[])
      : []
    const existingByProductId = new Map(
      existingRecords.map((record) => [record.product_id, record])
    )
    const createInput: Array<{ product_id: string; plating: string[] }> = []
    const updateInput: Array<{ id: string; plating: string[] }> = []

    for (const product of products) {
      scanned += 1

      const plating = extractFinish(product.description)

      if (!plating) {
        missing += 1
        continue
      }

      detected += 1
      platingCounts.set(plating, (platingCounts.get(plating) ?? 0) + 1)
      logger.info(`${product.id}, ${product.handle ?? ""}, ${plating}`)

      const nextPlating = [plating]
      const existing = existingByProductId.get(product.id)

      if (existing) {
        if (valuesEqual(existing.plating, nextPlating)) {
          unchanged += 1
          continue
        }

        updateInput.push({
          id: existing.id,
          plating: nextPlating,
        })
        continue
      }

      createInput.push({
        product_id: product.id,
        plating: nextPlating,
      })
    }

    if (!options.dryRun) {
      if (createInput.length) {
        await customFieldService.createProductCustomFields(createInput)
      }

      if (updateInput.length) {
        await customFieldService.updateProductCustomFields(updateInput)
      }
    }

    created += createInput.length
    updated += updateInput.length

    logger.info(
      `${options.dryRun ? "Would create" : "Created"} ${createInput.length}, ${
        options.dryRun ? "would update" : "updated"
      } ${updateInput.length} in this batch.`
    )
    logger.info(`Scanned ${scanned}/${totalProducts} products...`)

    if (scanned >= totalProducts || products.length < take) {
      break
    }
  }

  const platingSummary = [...platingCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([plating, count]) => `${plating}: ${count}`)
    .join("\n")

  logger.info(`Unique plating values:\n${platingSummary || "(none)"}`)
  logger.info(
    `Done. Scanned ${scanned} products. Detected ${detected}, ${
      options.dryRun ? "would create" : "created"
    } ${created}, ${options.dryRun ? "would update" : "updated"} ${updated}, unchanged ${unchanged}, missing ${missing}.`
  )
}
