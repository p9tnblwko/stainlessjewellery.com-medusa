import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

type ProductWithDescription = {
  id: string
  title?: string | null
  handle?: string | null
  description?: string | null
  material?: string | null
}

type ScriptOptions = {
  batchSize: number
  limit?: number
}

const DEFAULT_BATCH_SIZE = 500
const EMPTY_VALUES = new Set(["", "unknown", "n/a", "na", "none", "null"])

const MATERIAL_ALIASES: Array<[RegExp, string]> = [
  [/\b(?:316l|tk316)?\s*stainless\s+steel\b/i, "Stainless Steel"],
  [/\bstainless\s+steel\b/i, "Stainless Steel"],
  [/\b925\s+sterling\s+silver\b/i, "Sterling Silver"],
  [/\bsterling\s+silver\s+925\b/i, "Sterling Silver"],
  [/\bsterling\s+silver\b/i, "Sterling Silver"],
  [/\bss925\b/i, "Sterling Silver"],
  [/\bwhite\s+metal\b/i, "White Metal"],
  [/\bbrass\b/i, "Brass"],
  [/\biron\b/i, "Iron"],
  [/\b(?:resin|stone|plastic|paper|velvet|wood|gold|platina)\b/i, "Other"],
]

function parseOptions(args: string[] = []): ScriptOptions {
  const normalizedArgs = args.map((arg) => arg.replace(/^--/, ""))
  const options: ScriptOptions = {
    batchSize: DEFAULT_BATCH_SIZE,
  }

  for (const arg of normalizedArgs) {
    if (arg.startsWith("batch-size=")) {
      const value = Number(arg.replace("batch-size=", ""))

      if (Number.isInteger(value) && value > 0) {
        options.batchSize = value
      }
    }

    if (arg.startsWith("limit=")) {
      const value = Number(arg.replace("limit=", ""))

      if (Number.isInteger(value) && value > 0) {
        options.limit = value
      }
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

function normalizeMaterial(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const normalized = decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .replace(/,?\s+Plating\s*:.*$/i, "")
    .replace(/\s+Finish\s*:.*$/i, "")
    .replace(/[.;,:\s]+$/g, "")
    .trim()

  if (EMPTY_VALUES.has(normalized.toLowerCase())) {
    return null
  }

  for (const [pattern, material] of MATERIAL_ALIASES) {
    if (pattern.test(normalized)) {
      return material
    }
  }

  return "Other"
}

function extractMaterial(description?: string | null): string | null {
  if (!description) {
    return null
  }

  const materialLabelMatch = description.match(
    /(?:<strong>\s*)?Material\s*:\s*(?:<\/strong>\s*)?([^<\n\r]+)/i
  )
  const materialFromLabel = normalizeMaterial(materialLabelMatch?.[1])

  if (materialFromLabel) {
    return materialFromLabel
  }

  const text = stripHtml(description)
  const textLabelMatch = text.match(/(?:^|\s)Material\s*:\s*([^:]+?)(?:\s+[A-Z][A-Za-z ]+\s*:|$)/i)
  const materialFromTextLabel = normalizeMaterial(textLabelMatch?.[1])

  if (materialFromTextLabel) {
    return materialFromTextLabel
  }

  const craftedFromMatch = text.match(
    /crafted\s+from\s+(?:durable\s+)?(.+?)(?:\s+with\s+(?:a|an)\s+|,\s+|\.\s+|$)/i
  )

  return normalizeMaterial(craftedFromMatch?.[1])
}

function isSameMaterial(current?: string | null, next?: string | null) {
  return (current ?? "").trim().toLowerCase() === (next ?? "").trim().toLowerCase()
}

export default async function syncProductMaterialsFromDescription({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any
  const options = parseOptions(args)
  let scanned = 0
  let detected = 0
  let missing = 0
  let updated = 0
  let unchanged = 0
  let totalProducts = 0
  const materialCounts = new Map<string, number>()

  logger.info("Scanning product descriptions and updating product materials...")

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
        select: ["id", "title", "handle", "description", "material"],
        skip: offset,
        take,
      }
    )) as [ProductWithDescription[], number]

    totalProducts = options.limit ? Math.min(count, options.limit) : count

    if (!products.length) {
      break
    }

    const updates: Array<{ id: string; material: string }> = []

    for (const product of products) {
      scanned += 1

      const material = extractMaterial(product.description)

      if (!material) {
        missing += 1
        continue
      }

      detected += 1
      materialCounts.set(material, (materialCounts.get(material) ?? 0) + 1)
      logger.info(`${product.id}, ${product.handle ?? ""}, ${material}`)

      if (isSameMaterial(product.material, material)) {
        unchanged += 1
        continue
      }

      updates.push({
        id: product.id,
        material,
      })
    }

    if (updates.length) {
      await updateProductsWorkflow(container).run({
        input: {
          products: updates,
        },
      })

      updated += updates.length
      logger.info(`Updated ${updates.length} products in this batch.`)
    }

    logger.info(`Scanned ${scanned}/${totalProducts} products...`)

    if (scanned >= totalProducts || products.length < take) {
      break
    }
  }

  const materialSummary = [...materialCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([material, count]) => `${material}: ${count}`)
    .join("\n")

  logger.info(
    `Unique material values:\n${materialSummary || "(none)"}`
  )
  logger.info(
    `Done. Scanned ${scanned} products. Detected ${detected}, updated ${updated}, unchanged ${unchanged}, missing ${missing}.`
  )
}
