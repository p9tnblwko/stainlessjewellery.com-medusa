import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

type ProductImage = {
  id: string
  url?: string | null
}

type ProductRecord = {
  id: string
  handle?: string | null
  thumbnail?: string | null
  images?: ProductImage[] | null
}

type ProductUpdate = {
  id: string
  thumbnail?: string | null
  images?: Array<{
    id?: string
    url: string
  }>
}

type TargetEnv = "dev" | "prod"

type ScriptOptions = {
  staticBaseUrl: string
  targetEnv: TargetEnv
  batchSize: number
  dryRun: boolean
}

const STATIC_BASE_URLS: Record<TargetEnv, string> = {
  dev: "http://localhost:9000/static",
  prod: "https://api.stainlessjewellery.com/static",
}
const DEFAULT_BATCH_SIZE = 100

function parseBatchSize(value?: string | number) {
  const batchSize = Number.parseInt(String(value || ""), 10)

  if (!Number.isFinite(batchSize) || batchSize < 1) {
    return DEFAULT_BATCH_SIZE
  }

  return batchSize
}

function parseOptions(targetEnv: TargetEnv, args: string[] = []): ScriptOptions {
  const normalizedArgs = args.map((arg) => arg.replace(/^--/, ""))
  let staticBaseUrl: string | undefined
  let batchSize = DEFAULT_BATCH_SIZE
  let dryRun = false

  for (const arg of normalizedArgs) {
    const [key, value] = arg.includes("=") ? arg.split("=", 2) : [arg, ""]

    if (key === "base-url" && value) {
      staticBaseUrl = value
    }

    if (key === "batch-size" && value) {
      batchSize = parseBatchSize(value)
    }

    if (key === "dry-run" || key === "dryRun") {
      dryRun = value ? value !== "false" : true
    }
  }

  return {
    staticBaseUrl: (staticBaseUrl || STATIC_BASE_URLS[targetEnv]).replace(
      /\/+$/,
      ""
    ),
    targetEnv,
    batchSize,
    dryRun,
  }
}

function isShopifyUrl(value?: string | null) {
  if (!value) {
    return false
  }

  try {
    return new URL(value).hostname.endsWith("shopify.com")
  } catch {
    return value.includes("shopify.com")
  }
}

function filenameFromUrl(value: string) {
  try {
    const url = new URL(value)
    const filename = url.pathname.split("/").filter(Boolean).at(-1)

    return filename ? decodeURIComponent(filename) : undefined
  } catch {
    const filename = value.split("?")[0].split("/").filter(Boolean).at(-1)

    return filename ? decodeURIComponent(filename) : undefined
  }
}

function toStaticUrl(value: string, staticBaseUrl: string) {
  const filename = filenameFromUrl(value)

  if (!filename) {
    return undefined
  }

  return `${staticBaseUrl}/${encodeURIComponent(filename)}`
}

function buildProductUpdate(
  product: ProductRecord,
  staticBaseUrl: string
): ProductUpdate | undefined {
  const update: ProductUpdate = { id: product.id }
  let changed = false
  let imagesChanged = false

  if (isShopifyUrl(product.thumbnail)) {
    const rewrittenThumbnail = toStaticUrl(product.thumbnail!, staticBaseUrl)

    if (rewrittenThumbnail && rewrittenThumbnail !== product.thumbnail) {
      update.thumbnail = rewrittenThumbnail
      changed = true
    }
  }

  const images = product.images || []
  const rewrittenImages = images.map((image) => {
    if (!isShopifyUrl(image.url)) {
      return {
        id: image.id,
        url: image.url || "",
      }
    }

    const rewrittenUrl = toStaticUrl(image.url!, staticBaseUrl)

    if (rewrittenUrl && rewrittenUrl !== image.url) {
      changed = true
      imagesChanged = true

      return {
        id: image.id,
        url: rewrittenUrl,
      }
    }

    return {
      id: image.id,
      url: image.url || "",
    }
  })

  if (imagesChanged) {
    update.images = rewrittenImages
  }

  return changed ? update : undefined
}

export async function rewriteShopifyImageUrls(
  { container, args }: ExecArgs,
  targetEnv: TargetEnv
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any
  const options = parseOptions(targetEnv, args)

  let scanned = 0
  let updated = 0
  let unchanged = 0
  let totalProducts = 0

  logger.info(`Target env: ${options.targetEnv}`)
  logger.info(`Rewriting Shopify image URLs to: ${options.staticBaseUrl}`)
  logger.info(`Dry run: ${options.dryRun ? "yes" : "no"}`)

  for (let offset = 0; ; offset += options.batchSize) {
    const [products, count] = (await productService.listAndCountProducts(
      {},
      {
        select: ["id", "handle", "thumbnail", "images.id", "images.url"],
        relations: ["images"],
        skip: offset,
        take: options.batchSize,
      }
    )) as [ProductRecord[], number]

    totalProducts = count

    if (!products.length) {
      break
    }

    const updates = products
      .map((product) => buildProductUpdate(product, options.staticBaseUrl))
      .filter(Boolean) as ProductUpdate[]

    scanned += products.length
    unchanged += products.length - updates.length

    if (updates.length) {
      for (const update of updates) {
        const product = products.find((item) => item.id === update.id)

        logger.info(
          `${options.dryRun ? "[dry-run] " : ""}${
            product?.handle ?? update.id
          }: rewriting Shopify image URLs`
        )
      }

      if (!options.dryRun) {
        await updateProductsWorkflow(container).run({
          input: {
            products: updates,
          },
        })
      }

      updated += updates.length
    }

    logger.info(`Scanned ${scanned}/${totalProducts} products...`)

    if (scanned >= totalProducts || products.length < options.batchSize) {
      break
    }
  }

  logger.info(
    `Done. Scanned ${scanned} products. ${
      options.dryRun ? "Would update" : "Updated"
    } ${updated}. Unchanged ${unchanged}.`
  )
}
