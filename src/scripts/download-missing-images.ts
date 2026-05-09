import { createWriteStream } from "fs"
import { mkdir, readFile, stat, unlink } from "fs/promises"
import http from "http"
import https from "https"
import path from "path"
import { pipeline } from "stream/promises"

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

type ProductImage = {
  url?: string | null
}

type ProductRecord = {
  thumbnail?: string | null
  images?: ProductImage[] | null
}

type CsvImageSource = {
  column: string
  url: string
}

type ImageProcessResult =
  | "alreadyExists"
  | "downloaded"
  | "skippedNoCsvSource"
  | "failed"

type ProgressCounts = Record<ImageProcessResult, number>

const DEFAULT_CSV_PATH = "./src/scripts/medusa_import_v4.csv"
const DEFAULT_STATIC_DIR = "./static"
const DEFAULT_STATIC_BASE_URL = "http://localhost:9000/static"
const DEFAULT_CONCURRENCY = 20
const PROGRESS_BAR_WIDTH = 30
const IMAGE_COLUMNS = new Set([
  "Product Thumbnail",
  ...Array.from({ length: 20 }, (_, index) => `Product Image ${index + 1}`),
])

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

async function readCsvImageSources(csvPath: string) {
  const csv = await readFile(csvPath, "utf8")
  const [header, ...rows] = parseCsv(csv)
  const imageColumnIndexes = header
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => IMAGE_COLUMNS.has(column))
  const byFilename = new Map<string, CsvImageSource>()

  for (const row of rows) {
    for (const { column, index } of imageColumnIndexes) {
      const value = row[index]?.trim()

      if (!value) {
        continue
      }

      const filename = filenameFromUrl(value)

      if (filename && !byFilename.has(filename)) {
        byFilename.set(filename, { column, url: value })
      }
    }
  }

  return byFilename
}

function filenameFromUrl(value: string) {
  try {
    const url = new URL(value)
    const filename = path.basename(decodeURIComponent(url.pathname))

    return filename || undefined
  } catch {
    const withoutQuery = value.split("?")[0]
    const filename = path.basename(withoutQuery)

    return filename || undefined
  }
}

function normalizeStaticBaseUrl(value?: string) {
  return (value || DEFAULT_STATIC_BASE_URL).replace(/\/+$/, "")
}

function parseConcurrency(value?: string) {
  const concurrency = Number.parseInt(value || "", 10)

  if (!Number.isFinite(concurrency) || concurrency < 1) {
    return DEFAULT_CONCURRENCY
  }

  return concurrency
}

function staticUrlForFilename(staticBaseUrl: string, filename: string) {
  return `${staticBaseUrl}/${encodeURIComponent(filename)}`
}

function requestExists(url: string, method: "HEAD" | "GET" = "HEAD") {
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

async function localFileExists(staticDir: string, filename: string) {
  try {
    const result = await stat(path.join(staticDir, filename))

    return result.isFile() && result.size > 0
  } catch {
    return false
  }
}

async function urlExists(url: string) {
  const headExists = await requestExists(url)

  return headExists || requestExists(url, "GET")
}

function downloadFile(url: string, outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http
    const request = client.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume()
        downloadFile(new URL(response.headers.location, url).toString(), outputPath)
          .then(resolve)
          .catch(reject)
        return
      }

      if (!response.statusCode || response.statusCode >= 400) {
        response.resume()
        reject(new Error(`Download failed (${response.statusCode}) for ${url}`))
        return
      }

      pipeline(response, createWriteStream(outputPath)).then(resolve).catch(reject)
    })

    request.setTimeout(30_000, () => {
      request.destroy(new Error(`Download timed out for ${url}`))
    })
    request.on("error", reject)
  })
}

async function listAll<T>(
  list: (skip: number, take: number) => Promise<T[]>,
  take = 1000
) {
  const records: T[] = []
  let skip = 0

  while (true) {
    const page = await list(skip, take)

    records.push(...page)

    if (page.length < take) {
      return records
    }

    skip += take
  }
}

function imageUrlsFromProducts(products: ProductRecord[]) {
  const urls = new Set<string>()

  for (const product of products) {
    if (product.thumbnail) {
      urls.add(product.thumbnail)
    }

    for (const image of product.images || []) {
      if (image.url) {
        urls.add(image.url)
      }
    }
  }

  return Array.from(urls).sort()
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onComplete?: (result: R, index: number) => void
) {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await worker(items[index], index)
      onComplete?.(results[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker)
  )

  return results
}

function createProgressBar(total: number) {
  const counts: ProgressCounts = {
    alreadyExists: 0,
    downloaded: 0,
    skippedNoCsvSource: 0,
    failed: 0,
  }
  const enabled = process.stdout.isTTY && total > 0

  function format() {
    const completed = Object.values(counts).reduce((sum, count) => sum + count, 0)
    const ratio = total ? completed / total : 1
    const filled = Math.round(ratio * PROGRESS_BAR_WIDTH)
    const bar = `${"#".repeat(filled)}${"-".repeat(
      PROGRESS_BAR_WIDTH - filled
    )}`
    const percent = Math.round(ratio * 100)

    return `Images [${bar}] ${completed}/${total} ${percent}% | exists ${counts.alreadyExists} | downloaded ${counts.downloaded} | missing ${counts.skippedNoCsvSource} | failed ${counts.failed}`
  }

  function render() {
    if (enabled) {
      process.stdout.write(`\r${format()}`)
    }
  }

  return {
    increment(result: ImageProcessResult) {
      counts[result]++
      render()
    },
    log(message: string, level: "log" | "warn" | "error" = "log") {
      if (enabled) {
        process.stdout.write(`\r${" ".repeat(process.stdout.columns || 120)}\r`)
      }

      console[level](message)
      render()
    },
    finish() {
      if (enabled) {
        process.stdout.write(`\r${format()}\n`)
      } else if (total > 0) {
        console.log(format())
      }
    },
    counts,
  }
}

async function processImageUrl({
  imageUrl,
  csvSources,
  staticBaseUrl,
  staticDir,
  dryRun,
  log,
}: {
  imageUrl: string
  csvSources: Map<string, CsvImageSource>
  staticBaseUrl: string
  staticDir: string
  dryRun: boolean
  log: (message: string, level?: "log" | "warn" | "error") => void
}): Promise<ImageProcessResult> {
  const filename = filenameFromUrl(imageUrl)

  if (!filename) {
    log(`Skipping URL without filename: ${imageUrl}`, "warn")
    return "skippedNoCsvSource"
  }

  if (await localFileExists(staticDir, filename)) {
    return "alreadyExists"
  }

  const staticUrl = staticUrlForFilename(staticBaseUrl, filename)

  if (await urlExists(staticUrl)) {
    return "alreadyExists"
  }

  const source = csvSources.get(filename)

  if (!source) {
    log(`No CSV source for missing file: ${filename}`, "warn")
    return "skippedNoCsvSource"
  }

  const outputPath = path.join(staticDir, filename)

  if (dryRun) {
    log(`[dry-run] Would download ${source.url} -> ${outputPath}`)
    return "downloaded"
  }

  try {
    await downloadFile(source.url, outputPath)
    log(`Downloaded ${filename} from ${source.column}`)
    return "downloaded"
  } catch (error) {
    await unlink(outputPath).catch(() => undefined)
    log(
      `Failed ${filename}: ${error instanceof Error ? error.message : error}`,
      "error"
    )
    return "failed"
  }
}

export default async function downloadMissingImages({ container }: ExecArgs) {
  const productModuleService = container.resolve(Modules.PRODUCT)
  const csvPath = path.resolve(
    process.cwd(),
    process.env.IMAGE_SOURCE_CSV || DEFAULT_CSV_PATH
  )
  const staticDir = path.resolve(
    process.cwd(),
    process.env.STATIC_IMAGE_DIR || DEFAULT_STATIC_DIR
  )
  const staticBaseUrl = normalizeStaticBaseUrl(process.env.STATIC_BASE_URL)
  const concurrency = parseConcurrency(process.env.IMAGE_DOWNLOAD_CONCURRENCY)
  const dryRun = process.env.DRY_RUN === "true"

  const csvSources = await readCsvImageSources(csvPath)
  const products = await listAll<ProductRecord>((skip, take) =>
    productModuleService.listProducts(
      {},
      {
        select: ["thumbnail", "images.url"],
        relations: ["images"],
        skip,
        take,
      }
    )
  )
  const imageUrls = imageUrlsFromProducts(products)

  await mkdir(staticDir, { recursive: true })

  console.log(`Products checked: ${products.length}`)
  console.log(`DB image URLs checked: ${imageUrls.length}`)
  console.log(`CSV image sources loaded: ${csvSources.size}`)
  console.log(`Static URL base: ${staticBaseUrl}`)
  console.log(`Static directory: ${path.relative(process.cwd(), staticDir)}`)
  console.log(`Parallel workers: ${concurrency}`)

  const progress = createProgressBar(imageUrls.length)
  const results = await mapConcurrent(
    imageUrls,
    concurrency,
    async (imageUrl) =>
      processImageUrl({
        imageUrl,
        csvSources,
        staticBaseUrl,
        staticDir,
        dryRun,
        log: progress.log,
      }),
    (result) => progress.increment(result)
  )
  progress.finish()
  const { alreadyExists, downloaded, skippedNoCsvSource, failed } =
    progress.counts

  console.log("Done")
  console.log(`Already exists: ${alreadyExists}`)
  console.log(`${dryRun ? "Would download" : "Downloaded"}: ${downloaded}`)
  console.log(`Missing CSV source: ${skippedNoCsvSource}`)
  console.log(`Failed: ${failed}`)
}
