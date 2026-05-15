import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type ProductRecord = {
  id: string
  title?: string | null
  handle?: string | null
  description?: string | null
}

type ScriptOptions = {
  batchSize: number
  limit?: number
}

type SplitDescriptionResult =
  | {
      ok: true
      introHtml: string
      detailsHtml: string
    }
  | {
      ok: false
      reason: "missing_description" | "missing_h3" | "empty_intro" | "empty_details"
    }

const DEFAULT_BATCH_SIZE = 500

function parseOptions(args: string[] = []): ScriptOptions {
  const options: ScriptOptions = {
    batchSize: DEFAULT_BATCH_SIZE,
  }

  for (const rawArg of args) {
    const arg = rawArg.replace(/^--/, "")
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

  }

  return options
}

function normalizeHtmlPart(value: string) {
  return value.trim()
}

function splitDescription(description?: string | null): SplitDescriptionResult {
  if (!description?.trim()) {
    return {
      ok: false,
      reason: "missing_description",
    }
  }

  const firstDetailsHeading = description.search(/<h3\b[^>]*>/i)

  if (firstDetailsHeading <= 0) {
    return {
      ok: false,
      reason: "missing_h3",
    }
  }

  const introHtml = normalizeHtmlPart(description.slice(0, firstDetailsHeading))
  const detailsHtml = normalizeHtmlPart(description.slice(firstDetailsHeading))

  if (!introHtml) {
    return {
      ok: false,
      reason: "empty_intro",
    }
  }

  if (!detailsHtml) {
    return {
      ok: false,
      reason: "empty_details",
    }
  }

  return {
    ok: true,
    introHtml,
    detailsHtml,
  }
}

export default async function splitProductDescriptions({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any
  const options = parseOptions(args)
  let scanned = 0
  let split = 0
  let missingDescription = 0
  let missingH3 = 0
  let emptyIntro = 0
  let emptyDetails = 0
  let totalProducts = 0

  logger.info("Scanning product descriptions for intro/detail split...")

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

    for (const product of products) {
      scanned += 1

      const parts = splitDescription(product.description)

      if (!parts.ok) {
        if (parts.reason === "missing_description") {
          missingDescription += 1
        }

        if (parts.reason === "missing_h3") {
          missingH3 += 1
        }

        if (parts.reason === "empty_intro") {
          emptyIntro += 1
        }

        if (parts.reason === "empty_details") {
          emptyDetails += 1
        }

        logger.warn(
          `${product.id}, ${product.handle ?? ""}, invalid split: ${parts.reason}`
        )
        continue
      }

      split += 1

      logger.info(
        `${product.id}, ${product.handle ?? ""}, intro ${parts.introHtml.length} chars, details ${parts.detailsHtml.length} chars`
      )
    }

    logger.info(`Scanned ${scanned}/${totalProducts} products...`)

    if (scanned >= totalProducts || products.length < take) {
      break
    }
  }

  logger.info(
    `Done. Scanned ${scanned} products. Valid splits ${split}. Missing description ${missingDescription}, missing h3 ${missingH3}, empty intro ${emptyIntro}, empty details ${emptyDetails}.`
  )
}
