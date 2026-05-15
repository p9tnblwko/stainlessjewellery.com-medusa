import { mkdir, writeFile } from "fs/promises"
import path from "path"

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

type SitemapEntry = {
  loc: string
  lastmod?: string | Date | null
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never"
  priority?: number
}

type ProductRecord = {
  handle?: string | null
  status?: string | null
  updated_at?: string | Date | null
}

type CategoryRecord = {
  handle?: string | null
  is_active?: boolean | null
  is_internal?: boolean | null
  parent_category_id?: string | null
  parent_category?: {
    handle?: string | null
  } | null
  updated_at?: string | Date | null
}

const DEFAULT_STATIC_ROUTES: SitemapEntry[] = [
  { loc: "/", changefreq: "weekly", priority: 1 },
  { loc: "/about", changefreq: "monthly", priority: 0.5 },
  { loc: "/care", changefreq: "monthly", priority: 0.5 },
  { loc: "/contact", changefreq: "monthly", priority: 0.5 },
  { loc: "/faq", changefreq: "monthly", priority: 0.5 },
  { loc: "/returns", changefreq: "monthly", priority: 0.5 },
  { loc: "/shipping", changefreq: "monthly", priority: 0.5 },
  { loc: "/size-guide", changefreq: "monthly", priority: 0.5 },
]

const DEFAULT_OUTPUT_PATH = "../stainlessjewellery.com-next/public/sitemap.xml"

function normalizeBaseUrl(value?: string) {
  const baseUrl = value?.trim().replace(/\/+$/, "")

  if (!baseUrl) {
    throw new Error("Missing site URL. Set SITE_URL, STORE_URL, or NEXT_PUBLIC_SITE_URL.")
  }

  return baseUrl
}

function absoluteUrl(baseUrl: string, route: string) {
  const pathName = route.startsWith("/") ? route : `/${route}`

  return `${baseUrl}${pathName}`
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function formatDate(value?: string | Date | null) {
  if (!value) {
    return undefined
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date.toISOString().slice(0, 10)
}

function renderSitemap(entries: SitemapEntry[], baseUrl: string) {
  const uniqueEntries = Array.from(
    new Map(entries.map((entry) => [entry.loc, entry])).values()
  ).sort((a, b) => a.loc.localeCompare(b.loc))

  const urls = uniqueEntries
    .map((entry) => {
      const lastmod = formatDate(entry.lastmod)
      const parts = [
        "  <url>",
        `    <loc>${escapeXml(absoluteUrl(baseUrl, entry.loc))}</loc>`,
      ]

      if (lastmod) {
        parts.push(`    <lastmod>${lastmod}</lastmod>`)
      }

      if (entry.changefreq) {
        parts.push(`    <changefreq>${entry.changefreq}</changefreq>`)
      }

      if (typeof entry.priority === "number") {
        parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`)
      }

      parts.push("  </url>")

      return parts.join("\n")
    })
    .join("\n")

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n")
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

function productEntries(products: ProductRecord[]): SitemapEntry[] {
  return products
    .filter(
      (product) =>
        product.handle && (!product.status || product.status === "published")
    )
    .map((product) => ({
      loc: `/products/${product.handle}`,
      lastmod: product.updated_at,
      changefreq: "weekly",
      priority: 0.8,
    }))
}

function categoryEntries(categories: CategoryRecord[]): SitemapEntry[] {
  const categoryById = new Map<string, CategoryRecord>()

  categories.forEach((category) => {
    const id = (category as { id?: string }).id

    if (id) {
      categoryById.set(id, category)
    }
  })

  return categories
    .filter(
      (category) =>
        category.handle &&
        category.is_active !== false &&
        category.is_internal !== true
    )
    .map((category) => {
      const parent =
        category.parent_category ??
        (category.parent_category_id
          ? categoryById.get(category.parent_category_id)
          : undefined)
      const parentHandle = parent?.handle
      const loc = parentHandle
        ? `/${parentHandle}/${category.handle}`
        : `/${category.handle}/all`

      return {
        loc,
        lastmod: category.updated_at,
        changefreq: "weekly",
        priority: parentHandle ? 0.7 : 0.8,
      }
    })
}

export default async function generateSitemap({ container }: ExecArgs) {
  const productModuleService = container.resolve(Modules.PRODUCT)
  const baseUrl = normalizeBaseUrl(
    process.env.SITE_URL ||
      process.env.STORE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL
  )
  const outputPath = path.resolve(
    process.cwd(),
    process.env.SITEMAP_OUTPUT_PATH || DEFAULT_OUTPUT_PATH
  )

  const [products, categories] = await Promise.all([
    listAll<ProductRecord>((skip, take) =>
      productModuleService.listProducts(
        {},
        { select: ["handle", "status", "updated_at"], skip, take }
      )
    ),
    listAll<CategoryRecord>((skip, take) =>
      productModuleService.listProductCategories(
        {},
        {
          select: [
            "id",
            "handle",
            "is_active",
            "is_internal",
            "parent_category_id",
            "parent_category.handle",
            "updated_at",
          ],
          skip,
          take,
        }
      )
    ),
  ])

  const entries = [
    ...DEFAULT_STATIC_ROUTES,
    ...productEntries(products),
    ...categoryEntries(categories),
  ]
  const sitemap = renderSitemap(entries, baseUrl)

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, sitemap, "utf8")

  console.log(`Generated ${entries.length} sitemap URLs`)
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`)
}
