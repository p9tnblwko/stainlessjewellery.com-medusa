import { mkdir, writeFile } from "fs/promises"
import path from "path"

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import { PRODUCT_CUSTOM_FIELD_MODULE } from "../modules/product-custom-field"

type CsvRow = Record<string, unknown>

type RegionRecord = {
  id: string
  name: string
  currency_code: string
}

type ProductCustomFieldRecord = {
  product_id: string
  stone_type?: string[] | null
  finish_plating?: string[] | null
  ring_style?: string[] | null
  earring_style?: string[] | null
  plating?: string[] | null
}

const DEFAULT_OUTPUT_PATH = "exports/products-import-readable.csv"
const PAGE_SIZE = 500

const PRODUCT_COLUMN_POSITIONS = new Map<string, number>([
  ["Product Id", 0],
  ["Product Handle", 1],
  ["Product Title", 2],
  ["Product Subtitle", 3],
  ["Product Description", 4],
  ["Product Status", 5],
  ["Product Thumbnail", 6],
  ["Product Weight", 7],
  ["Product Length", 8],
  ["Product Width", 9],
  ["Product Height", 10],
  ["Product Hs Code", 11],
  ["Product Origin Country", 12],
  ["Product Mid Code", 13],
  ["Product Material", 14],
  ["Shipping Profile Id", 15],
  ["Product Collection Id", 16],
  ["Product Type Id", 17],
  ["Product Discountable", 18],
  ["Product External Id", 19],
  ["Product Is Giftcard", 20],
  ["Product Metadata", 21],
  ["Product Custom Stone Type", 22],
  ["Product Custom Finish Plating", 23],
  ["Product Custom Ring Style", 24],
  ["Product Custom Earring Style", 25],
  ["Product Custom Plating", 26],
])

const VARIANT_COLUMN_POSITIONS = new Map<string, number>([
  ["Variant Id", 0],
  ["Variant Title", 1],
  ["Variant Sku", 2],
  ["Variant Upc", 3],
  ["Variant Ean", 4],
  ["Variant Hs Code", 5],
  ["Variant Mid Code", 6],
  ["Variant Manage Inventory", 7],
  ["Variant Allow Backorder", 8],
  ["Variant Barcode", 9],
])

const INDEXED_COLUMN_PREFIX_POSITIONS = new Map<string, number>([
  ["Product Category", 100],
  ["Product Image", 110],
  ["Product Tag", 120],
  ["Product Sales Channel", 130],
  ["Variant Option", 300],
  ["Variant Price", 310],
])

const PRODUCT_FIELDS = [
  "id",
  "handle",
  "title",
  "subtitle",
  "description",
  "status",
  "thumbnail",
  "weight",
  "length",
  "width",
  "height",
  "hs_code",
  "origin_country",
  "mid_code",
  "material",
  "collection_id",
  "type_id",
  "discountable",
  "external_id",
  "is_giftcard",
  "metadata",
  "collection.id",
  "collection.title",
  "collection.handle",
  "type.id",
  "type.value",
  "categories.id",
  "categories.name",
  "categories.handle",
  "categories.rank",
  "tags.id",
  "tags.value",
  "images.id",
  "images.url",
  "images.rank",
  "options.id",
  "options.title",
  "sales_channels.id",
  "sales_channels.name",
  "shipping_profile.id",
  "shipping_profile.name",
  "shipping_profile.type",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.upc",
  "variants.ean",
  "variants.hs_code",
  "variants.mid_code",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "variants.barcode",
  "variants.height",
  "variants.length",
  "variants.material",
  "variants.metadata",
  "variants.origin_country",
  "variants.variant_rank",
  "variants.weight",
  "variants.width",
  "variants.options.id",
  "variants.options.value",
  "variants.options.option_id",
  "variants.price_set.prices.id",
  "variants.price_set.prices.amount",
  "variants.price_set.prices.currency_code",
  "variants.price_set.prices.price_rules.attribute",
  "variants.price_set.prices.price_rules.value",
]

function argValue(args: string[] | undefined, name: string) {
  const index = args?.findIndex((arg) => arg === name)

  if (index === undefined || index < 0) {
    return undefined
  }

  return args?.[index + 1]
}

function outputPathFromArgs(args: string[] | undefined) {
  return (
    argValue(args, "--output") ||
    argValue(args, "-o") ||
    args?.find((arg) => !arg.startsWith("-")) ||
    DEFAULT_OUTPUT_PATH
  )
}

function isEmpty(value: unknown) {
  return value === undefined || value === null || value === ""
}

function scalar(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === "bigint") {
    return value.toString()
  }

  return value
}

function json(value: unknown) {
  return isEmpty(value) ? undefined : JSON.stringify(value)
}

function listValue(value: unknown) {
  if (!Array.isArray(value)) {
    return isEmpty(value) ? undefined : value
  }

  return value.filter((item) => !isEmpty(item)).join(", ")
}

function label(record: any, keys: string[]) {
  for (const key of keys) {
    if (!isEmpty(record?.[key])) {
      return record[key]
    }
  }

  return undefined
}

function sortByRank<T extends { rank?: number | null }>(items: T[] = []) {
  return [...items].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
}

function indexedColumns(
  row: CsvRow,
  prefix: string,
  values: unknown[]
) {
  values.forEach((value, index) => {
    if (!isEmpty(value)) {
      row[`${prefix} ${index + 1}`] = value
    }
  })
}

function productBaseRow(
  product: any,
  customFields?: ProductCustomFieldRecord
): CsvRow {
  const row: CsvRow = {
    "Product Id": product.id,
    "Product Handle": product.handle,
    "Product Title": product.title,
    "Product Subtitle": product.subtitle,
    "Product Description": product.description,
    "Product Status": product.status,
    "Product Thumbnail": product.thumbnail,
    "Product Weight": scalar(product.weight),
    "Product Length": scalar(product.length),
    "Product Width": scalar(product.width),
    "Product Height": scalar(product.height),
    "Product Hs Code": product.hs_code,
    "Product Origin Country": product.origin_country,
    "Product Mid Code": product.mid_code,
    "Product Material": product.material,
    "Product Collection Id": label(product.collection, [
      "title",
      "handle",
      "id",
    ]),
    "Product Type Id": label(product.type, ["value", "id"]),
    "Product Discountable": product.discountable,
    "Product External Id": product.external_id,
    "Product Is Giftcard": product.is_giftcard,
    "Product Metadata": json(product.metadata),
    "Product Custom Stone Type": listValue(customFields?.stone_type),
    "Product Custom Finish Plating": listValue(customFields?.finish_plating),
    "Product Custom Ring Style": listValue(customFields?.ring_style),
    "Product Custom Earring Style": listValue(customFields?.earring_style),
    "Product Custom Plating": listValue(customFields?.plating),
    "Shipping Profile Id": label(product.shipping_profile, [
      "name",
      "type",
      "id",
    ]),
  }

  indexedColumns(
    row,
    "Product Image",
    sortByRank(product.images).map((image: any) => image.url)
  )
  indexedColumns(
    row,
    "Product Tag",
    (product.tags ?? []).map((tag: any) => label(tag, ["value", "id"]))
  )
  indexedColumns(
    row,
    "Product Category",
    sortByRank(product.categories).map((category: any) =>
      label(category, ["name", "handle", "id"])
    )
  )
  indexedColumns(
    row,
    "Product Sales Channel",
    (product.sales_channels ?? []).map((channel: any) =>
      label(channel, ["name", "id"])
    )
  )

  return row
}

function regionPriceColumn(price: any, regionsById: Map<string, RegionRecord>) {
  const regionRule = price.price_rules?.find(
    (rule: any) => rule.attribute === "region_id"
  )

  if (!regionRule) {
    return `Variant Price ${String(price.currency_code).toUpperCase()}`
  }

  const region = regionsById.get(regionRule.value)

  if (!region) {
    return `Variant Price [${regionRule.value}] ${String(
      price.currency_code
    ).toUpperCase()}`
  }

  return `Variant Price [${region.name}] ${region.currency_code.toUpperCase()}`
}

function variantRow(
  product: any,
  variant: any,
  regionsById: Map<string, RegionRecord>,
  customFields?: ProductCustomFieldRecord
): CsvRow {
  const row: CsvRow = {
    ...productBaseRow(product, customFields),
    "Variant Id": variant.id,
    "Variant Title": variant.title,
    "Variant Sku": variant.sku,
    "Variant Upc": variant.upc,
    "Variant Ean": variant.ean,
    "Variant Hs Code": variant.hs_code,
    "Variant Mid Code": variant.mid_code,
    "Variant Manage Inventory": variant.manage_inventory,
    "Variant Allow Backorder": variant.allow_backorder,
    "Variant Barcode": variant.barcode,
    "Variant Height": scalar(variant.height),
    "Variant Length": scalar(variant.length),
    "Variant Material": variant.material,
    "Variant Metadata": json(variant.metadata),
    "Variant Origin Country": variant.origin_country,
    "Variant Variant Rank": scalar(variant.variant_rank),
    "Variant Weight": scalar(variant.weight),
    "Variant Width": scalar(variant.width),
  }

  const productOptionsById = new Map(
    (product.options ?? []).map((option: any) => [option.id, option.title])
  )

  ;(variant.options ?? []).forEach((option: any, index: number) => {
    row[`Variant Option ${index + 1} Name`] =
      productOptionsById.get(option.option_id) ?? option.option?.title
    row[`Variant Option ${index + 1} Value`] = option.value
  })

  const prices = variant.price_set?.prices ?? variant.prices ?? []

  prices.forEach((price: any) => {
    if (!isEmpty(price.amount) && !isEmpty(price.currency_code)) {
      row[regionPriceColumn(price, regionsById)] = scalar(price.amount)
    }
  })

  return row
}

function normalizeProduct(
  product: any,
  regionsById: Map<string, RegionRecord>,
  customFields?: ProductCustomFieldRecord
) {
  const variants = product.variants ?? []

  if (!variants.length) {
    return [productBaseRow(product, customFields)]
  }

  return variants
    .slice()
    .sort((a: any, b: any) => (a.variant_rank ?? 0) - (b.variant_rank ?? 0))
    .map((variant: any) =>
      variantRow(product, variant, regionsById, customFields)
    )
}

function compareKnownColumns(
  a: string,
  b: string,
  positions: Map<string, number>
) {
  const aPosition = positions.get(a)
  const bPosition = positions.get(b)

  if (aPosition !== undefined && bPosition !== undefined) {
    return aPosition - bPosition
  }

  if (aPosition !== undefined) {
    return -1
  }

  if (bPosition !== undefined) {
    return 1
  }

  return a.localeCompare(b)
}

function indexedColumnPosition(column: string) {
  const match = column.match(
    /^(Product Category|Product Image|Product Tag|Product Sales Channel|Variant Option|Variant Price) (\d+)?(?: .*)?$/
  )

  if (!match) {
    return undefined
  }

  const [, prefix, index] = match
  const prefixPosition = INDEXED_COLUMN_PREFIX_POSITIONS.get(prefix)

  if (prefixPosition === undefined) {
    return undefined
  }

  return prefixPosition + (index ? Number(index) / 100 : 0)
}

function columnPosition(column: string) {
  const productPosition = PRODUCT_COLUMN_POSITIONS.get(column)

  if (productPosition !== undefined) {
    return productPosition
  }

  const indexedPosition = indexedColumnPosition(column)

  if (indexedPosition !== undefined) {
    return indexedPosition
  }

  const variantPosition = VARIANT_COLUMN_POSITIONS.get(column)

  return variantPosition === undefined ? undefined : 200 + variantPosition
}

function compareColumns(a: string, b: string) {
  const aPosition = columnPosition(a)
  const bPosition = columnPosition(b)

  if (aPosition !== undefined && bPosition !== undefined) {
    return aPosition - bPosition || a.localeCompare(b)
  }

  if (aPosition !== undefined) {
    return -1
  }

  if (bPosition !== undefined) {
    return 1
  }

  if (a.startsWith("Product") && b.startsWith("Product")) {
    return compareKnownColumns(a, b, PRODUCT_COLUMN_POSITIONS)
  }

  if (a.startsWith("Variant") && b.startsWith("Variant")) {
    return compareKnownColumns(a, b, VARIANT_COLUMN_POSITIONS)
  }

  return a.localeCompare(b)
}

function escapeCsvValue(value: unknown) {
  if (isEmpty(value)) {
    return ""
  }

  const stringValue = String(value)

  if (/["\n\r,]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

function toCsv(rows: CsvRow[]) {
  const headers = Array.from(
    rows.reduce((acc, row) => {
      Object.keys(row).forEach((key) => acc.add(key))

      return acc
    }, new Set<string>())
  ).sort(compareColumns)

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(",")
    ),
    "",
  ].join("\n")
}

async function listAllProducts(query: any, logger: any) {
  const products: any[] = []
  let skip = 0

  while (true) {
    const { data, metadata } = await query.graph({
      entity: "product",
      fields: PRODUCT_FIELDS,
      pagination: {
        skip,
        take: PAGE_SIZE,
        order: {
          handle: "ASC",
        },
      },
    })

    products.push(...data)
    logger.info(
      `Loaded ${products.length}${metadata?.count ? `/${metadata.count}` : ""} products`
    )

    if (data.length < PAGE_SIZE) {
      return products
    }

    skip += PAGE_SIZE
  }
}

async function listCustomFieldsByProductId(
  container: ExecArgs["container"],
  productIds: string[]
) {
  const service = container.resolve(PRODUCT_CUSTOM_FIELD_MODULE) as any
  const customFields = (await service.listProductCustomFields(
    {
      product_id: productIds,
    },
    {
      take: productIds.length,
    }
  )) as ProductCustomFieldRecord[]

  return new Map(
    customFields.map((record) => [record.product_id, record] as const)
  )
}

export default async function exportProductsImportCsv({
  args,
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const regionService = container.resolve(Modules.REGION)
  const outputPath = path.resolve(process.cwd(), outputPathFromArgs(args))

  logger.info("Exporting products to readable Medusa import CSV...")

  const [products, regions] = await Promise.all([
    listAllProducts(query, logger),
    regionService.listRegions({}, { select: ["id", "name", "currency_code"] }),
  ])
  const customFieldsByProductId = await listCustomFieldsByProductId(
    container,
    products.map((product) => product.id)
  )
  const regionsById = new Map(
    (regions as RegionRecord[]).map((region) => [region.id, region])
  )
  const rows = products.flatMap((product) =>
    normalizeProduct(
      product,
      regionsById,
      customFieldsByProductId.get(product.id)
    )
  )
  const csv = toCsv(rows)

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, csv, "utf8")

  logger.info(`Exported ${products.length} products and ${rows.length} CSV rows.`)
  logger.info(`Wrote ${outputPath}`)
}
