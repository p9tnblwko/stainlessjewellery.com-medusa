import { readFile } from "fs/promises"
import http from "http"
import https from "https"
import path from "path"

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

type CsvImageSource = {
  column: string
  productHandle?: string
  shopifyUrl: string
}

type ScriptOptions = {
  batchSize: number
  limit?: number
  staticBaseUrl: string
  csvPath: string
  imageMapCsvPath?: string
  dryRun: boolean
}

type ImageCheckResult = {
  image: ProductImage
  filename?: string
  exists: boolean
  staticUrl?: string
  csvSource?: CsvImageSource
}

const DEFAULT_BATCH_SIZE = 100
const DEFAULT_STATIC_BASE_URL = "https://api.stainlessjewellery.com/static"
const DEFAULT_CSV_PATH = "./src/scripts/medusa_import_v4.csv"
const DEFAULT_IMAGE_MAP_CSV_PATH = "../ProductsMigration/shopify_image_map.csv"
const IMAGE_COLUMNS = new Set([
  "Product Thumbnail",
  ...Array.from({ length: 20 }, (_, index) => `Product Image ${index + 1}`),
])

function parseOptions(args: string[] = []): ScriptOptions {
  const options: ScriptOptions = {
    batchSize: DEFAULT_BATCH_SIZE,
    staticBaseUrl: (process.env.STATIC_BASE_URL || DEFAULT_STATIC_BASE_URL).replace(
      /\/+$/,
      ""
    ),
    csvPath: path.resolve(process.cwd(), process.env.IMAGE_SOURCE_CSV || DEFAULT_CSV_PATH),
    imageMapCsvPath: path.resolve(
      process.cwd(),
      process.env.IMAGE_MAP_CSV || DEFAULT_IMAGE_MAP_CSV_PATH
    ),
    dryRun: process.env.DRY_RUN !== "false",
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

    if ((key === "static-base-url" || key === "base-url") && value) {
      options.staticBaseUrl = value.replace(/\/+$/, "")
    }

    if (key === "csv" && value) {
      options.csvPath = path.resolve(process.cwd(), value)
    }

    if (key === "image-map-csv" && value) {
      options.imageMapCsvPath = path.resolve(process.cwd(), value)
    }

    if (key === "no-image-map-csv") {
      options.imageMapCsvPath = undefined
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

function filenameFromUrl(value?: string | null) {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value)
    const filename = path.basename(decodeURIComponent(url.pathname))

    return filename || undefined
  } catch {
    const filename = path.basename(value.split("?")[0])

    return filename || undefined
  }
}

function staticUrlForFilename(staticBaseUrl: string, filename: string) {
  return `${staticBaseUrl}/${encodeURIComponent(filename)}`
}

async function requestExists(url: string, method: "HEAD" | "GET" = "HEAD") {
  return new Promise<boolean>((resolve) => {
    const client = url.startsWith("https:") ? https : http
    const request = client.request(url, { method }, (response) => {
      response.resume()

      if (
        response.statusCode === 405 ||
        response.statusCode === 403 ||
        response.statusCode === 501
      ) {
        resolve(method === "HEAD" ? false : response.statusCode < 400)
        return
      }

      resolve(response.statusCode !== undefined && response.statusCode < 400)
    })

    request.setTimeout(10_000, () => {
      request.destroy()
      resolve(false)
    })
    request.on("error", () => resolve(false))
    request.end()
  })
}

async function urlExists(url: string) {
  const headExists = await requestExists(url)

  return headExists || requestExists(url, "GET")
}

async function readMedusaImportImageSources(csvPath: string) {
  const byFilename = new Map<string, CsvImageSource>()
  const byHandleAndFilename = new Map<string, CsvImageSource>()
  const csv = await readFile(csvPath, "utf8")
  const [header, ...rows] = parseCsv(csv)
  const handleIndex = header.indexOf("Product Handle")
  const imageColumnIndexes = header
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => IMAGE_COLUMNS.has(column))

  for (const row of rows) {
    const productHandle = handleIndex >= 0 ? row[handleIndex]?.trim() : undefined

    for (const { column, index } of imageColumnIndexes) {
      const shopifyUrl = row[index]?.trim()
      const filename = filenameFromUrl(shopifyUrl)

      if (!shopifyUrl || !filename) {
        continue
      }

      const source = {
        column,
        productHandle,
        shopifyUrl,
      }

      if (productHandle) {
        byHandleAndFilename.set(`${productHandle}:${filename}`, source)
      }

      if (!byFilename.has(filename)) {
        byFilename.set(filename, source)
      }
    }
  }

  return {
    byFilename,
    byHandleAndFilename,
  }
}

async function readImageMapSources(imageMapCsvPath?: string) {
  const byFilename = new Map<string, CsvImageSource>()

  if (!imageMapCsvPath) {
    return byFilename
  }

  try {
    const csv = await readFile(imageMapCsvPath, "utf8")
    const [header, ...rows] = parseCsv(csv)
    const sourceIndex = header.indexOf("source_url")

    if (sourceIndex < 0) {
      return byFilename
    }

    for (const row of rows) {
      const shopifyUrl = row[sourceIndex]?.trim()
      const filename = filenameFromUrl(shopifyUrl)

      if (!shopifyUrl || !filename || byFilename.has(filename)) {
        continue
      }

      byFilename.set(filename, {
        column: "source_url",
        shopifyUrl,
      })
    }
  } catch {
    return byFilename
  }

  return byFilename
}

function findCsvSource({
  filename,
  productHandle,
  medusaSources,
  imageMapSources,
}: {
  filename: string
  productHandle?: string | null
  medusaSources: Awaited<ReturnType<typeof readMedusaImportImageSources>>
  imageMapSources: Map<string, CsvImageSource>
}) {
  if (productHandle) {
    const handleMatch = medusaSources.byHandleAndFilename.get(
      `${productHandle}:${filename}`
    )

    if (handleMatch) {
      return handleMatch
    }
  }

  return medusaSources.byFilename.get(filename) ?? imageMapSources.get(filename)
}

async function checkProductImage({
  image,
  productHandle,
  staticBaseUrl,
  medusaSources,
  imageMapSources,
}: {
  image: ProductImage
  productHandle?: string | null
  staticBaseUrl: string
  medusaSources: Awaited<ReturnType<typeof readMedusaImportImageSources>>
  imageMapSources: Map<string, CsvImageSource>
}): Promise<ImageCheckResult> {
  const filename = filenameFromUrl(image.url)

  if (!filename) {
    return {
      image,
      exists: false,
    }
  }

  const staticUrl = staticUrlForFilename(staticBaseUrl, filename)
  const exists = await urlExists(staticUrl)

  return {
    image,
    filename,
    exists,
    staticUrl,
    csvSource: findCsvSource({
      filename,
      productHandle,
      medusaSources,
      imageMapSources,
    }),
  }
}

function uniqueImages(images: ProductImage[]) {
  const seen = new Set<string>()

  return images.filter((image) => {
    const key = image.url || image.id

    if (!key || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function buildProductUpdate(
  product: ProductRecord,
  imageResults: ImageCheckResult[],
  thumbnailResult?: ImageCheckResult
) {
  const keptImages = uniqueImages(
    imageResults
      .filter((result) => result.exists && result.image.url)
      .map((result) => result.image)
  )
  const removedImages = imageResults.filter((result) => !result.exists)
  const nextThumbnail =
    product.thumbnail && thumbnailResult?.exists
      ? product.thumbnail
      : keptImages[0]?.url ?? null
  const imagesChanged = removedImages.length > 0
  const thumbnailChanged = product.thumbnail !== nextThumbnail

  if (!imagesChanged && !thumbnailChanged) {
    return undefined
  }

  const update: ProductUpdate = {
    id: product.id,
  }

  if (imagesChanged) {
    update.images = keptImages.map((image) => ({
      id: image.id,
      url: image.url!,
    }))
  }

  if (thumbnailChanged) {
    update.thumbnail = nextThumbnail
  }

  return update
}

export default async function pruneMissingProductImages({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any
  const options = parseOptions(args)
  const medusaSources = await readMedusaImportImageSources(options.csvPath)
  const imageMapSources = await readImageMapSources(options.imageMapCsvPath)
  let scanned = 0
  let checkedImages = 0
  let missingImages = 0
  let productsToUpdate = 0
  let productsUpdated = 0
  let productsWithoutImages = 0
  let totalProducts = 0

  logger.info("Scanning product images against local static files...")
  logger.info(`Static base URL: ${options.staticBaseUrl}`)
  logger.info(`Image source CSV: ${options.csvPath}`)
  logger.info(`Image map CSV: ${options.imageMapCsvPath ?? "(disabled)"}`)
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
        select: ["id", "handle", "thumbnail", "images.id", "images.url"],
        relations: ["images"],
        skip: offset,
        take,
      }
    )) as [ProductRecord[], number]

    totalProducts = options.limit ? Math.min(count, options.limit) : count

    if (!products.length) {
      break
    }

    const updates: ProductUpdate[] = []

    for (const product of products) {
      scanned += 1
      const images = product.images ?? []
      const thumbnailResult = product.thumbnail
        ? await checkProductImage({
            image: {
              id: "__thumbnail__",
              url: product.thumbnail,
            },
            productHandle: product.handle,
            staticBaseUrl: options.staticBaseUrl,
            medusaSources,
            imageMapSources,
          })
        : undefined
      const imageResults = await Promise.all(
        images.map((image) =>
          checkProductImage({
            image,
            productHandle: product.handle,
            staticBaseUrl: options.staticBaseUrl,
            medusaSources,
            imageMapSources,
          })
        )
      )

      checkedImages += imageResults.length

      if (thumbnailResult) {
        checkedImages += 1

        if (!thumbnailResult.exists) {
          missingImages += 1
          logger.warn(
            [
              product.handle ?? product.id,
              "missing thumbnail",
              product.thumbnail,
              thumbnailResult.staticUrl
                ? `checked=${thumbnailResult.staticUrl}`
                : undefined,
              thumbnailResult.csvSource
                ? `shopify=${thumbnailResult.csvSource.shopifyUrl}`
                : "shopify=(not found in csv)",
            ]
              .filter(Boolean)
              .join(" | ")
          )
        }
      }

      for (const result of imageResults) {
        if (result.exists) {
          continue
        }

        missingImages += 1
        logger.warn(
          [
            product.handle ?? product.id,
            "missing image",
            result.image.url ?? "(empty url)",
            result.staticUrl ? `checked=${result.staticUrl}` : undefined,
            result.csvSource
              ? `shopify=${result.csvSource.shopifyUrl}`
              : "shopify=(not found in csv)",
          ]
            .filter(Boolean)
            .join(" | ")
        )
      }

      const update = buildProductUpdate(product, imageResults, thumbnailResult)

      if (!update) {
        continue
      }

      if (!update.thumbnail && !update.images?.length) {
        productsWithoutImages += 1
      }

      updates.push(update)
      logger.info(
        `${options.dryRun ? "[dry-run] " : ""}${product.handle ?? product.id}: remove ${
          imageResults.filter((result) => !result.exists).length
        } missing images, thumbnail -> ${update.thumbnail ?? "(none)"}`
      )
    }

    if (updates.length) {
      productsToUpdate += updates.length

      if (!options.dryRun) {
        await updateProductsWorkflow(container).run({
          input: {
            products: updates,
          },
        })

        productsUpdated += updates.length
      }
    }

    logger.info(`Scanned ${scanned}/${totalProducts} products...`)

    if (scanned >= totalProducts || products.length < take) {
      break
    }
  }

  logger.info(
    `Done. Scanned ${scanned} products. Checked ${checkedImages} images. Missing ${missingImages}. ${
      options.dryRun ? "Would update" : "Updated"
    } ${options.dryRun ? productsToUpdate : productsUpdated} products. Products left without images ${productsWithoutImages}.`
  )
}
