import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { PRODUCT_CUSTOM_FIELD_MODULE } from "../../../../../modules/product-custom-field"

const CUSTOM_FIELD_KEYS = [
  "stone_type",
  "finish_plating",
  "ring_style",
  "earring_style",
  "plating",
] as const

type ProductCustomFields = {
  stone_type?: string[] | null
  finish_plating?: string[] | null
  ring_style?: string[] | null
  earring_style?: string[] | null
  plating?: string[] | null
}

type ProductCustomFieldRecord = ProductCustomFields & {
  id: string
  product_id: string
}

function normalizeCustomFields(body: unknown): ProductCustomFields {
  if (!body || typeof body !== "object") {
    return {}
  }

  return CUSTOM_FIELD_KEYS.reduce<ProductCustomFields>((acc, key) => {
    const value = (body as Record<string, unknown>)[key]

    if (Array.isArray(value)) {
      const items = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)

      acc[key] = items.length ? items : null
    } else if (value === null) {
      acc[key] = null
    }

    return acc
  }, {})
}

async function retrieveCustomFields(
  service: any,
  productId: string
): Promise<ProductCustomFieldRecord | null> {
  const records = (await service.listProductCustomFields({
    product_id: productId,
  })) as ProductCustomFieldRecord[]

  return records[0] ?? null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = req.params.id
  const service = req.scope.resolve(PRODUCT_CUSTOM_FIELD_MODULE) as any
  const customFields = await retrieveCustomFields(service, productId)

  res.json({
    custom_fields: customFields,
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const productId = req.params.id
  const service = req.scope.resolve(PRODUCT_CUSTOM_FIELD_MODULE) as any
  const fields = normalizeCustomFields(req.body)
  const existing = await retrieveCustomFields(service, productId)

  const customFields = existing
    ? await service.updateProductCustomFields({
        id: existing.id,
        ...fields,
      })
    : await service.createProductCustomFields({
        product_id: productId,
        ...fields,
      })

  res.json({
    custom_fields: customFields,
  })
}
