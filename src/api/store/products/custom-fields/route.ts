import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ProductStatus } from "@medusajs/framework/utils"

import { PRODUCT_CUSTOM_FIELD_MODULE } from "../../../../modules/product-custom-field"

const CUSTOM_FIELD_KEYS = [
  "stone_type",
  "finish_plating",
  "ring_style",
  "earring_style",
  "plating",
] as const

type ProductCustomFieldRecord = {
  product_id: string
  stone_type?: string[] | null
  finish_plating?: string[] | null
  ring_style?: string[] | null
  earring_style?: string[] | null
  plating?: string[] | null
}

function getStringQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined
  }

  return typeof value === "string" ? value : undefined
}

function getStringQueryValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]

  return values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const filters = CUSTOM_FIELD_KEYS.reduce<Record<string, unknown>>(
    (acc, key) => {
      const values = getStringQueryValues(req.query[key])

      if (values.length) {
        acc[key] = { $overlap: values }
      }

      return acc
    },
    {}
  )

  const limit = Number(getStringQueryValue(req.query.limit)) || 20
  const offset = Number(getStringQueryValue(req.query.offset)) || 0
  const fields = getStringQueryValue(req.query.fields)
    ?.split(",")
    .map((field) => field.trim())
    .filter(Boolean)
  const productFields = fields
    ? fields.includes("id")
      ? fields
      : ["id", ...fields]
    : undefined
  const customFieldsOnly =
    fields?.length === 1 && fields[0] === "custom_fields"

  const customFieldService = req.scope.resolve(PRODUCT_CUSTOM_FIELD_MODULE) as any
  const productService = req.scope.resolve("product")

  const customFields = (await customFieldService.listProductCustomFields(
    filters,
    {
      select: ["product_id", ...CUSTOM_FIELD_KEYS],
    }
  )) as ProductCustomFieldRecord[]
  const productIds = customFields.map((record) => record.product_id)

  if (!productIds.length) {
    res.json({
      products: [],
      count: 0,
      limit,
      offset,
    })
    return
  }

  if (customFieldsOnly) {
    res.json({
      products: customFields
        .slice(offset, offset + limit)
        .map((record) => ({
          id: record.product_id,
          custom_fields: record,
        })),
      count: customFields.length,
      limit,
      offset,
    })
    return
  }

  const [products, count] = await productService.listAndCountProducts(
    {
      id: productIds,
      status: ProductStatus.PUBLISHED,
    },
    {
      skip: offset,
      take: limit,
      ...(productFields?.length ? { select: productFields } : {}),
    }
  )
  const customFieldsByProductId = new Map(
    customFields.map((record) => [record.product_id, record])
  )

  res.json({
    products: products.map((product) => ({
      ...product,
      custom_fields: customFieldsByProductId.get(product.id) ?? null,
    })),
    count,
    limit,
    offset,
  })
}
