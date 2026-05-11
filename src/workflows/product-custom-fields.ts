import {
  createProductsWorkflow,
  deleteProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { StepResponse } from "@medusajs/framework/workflows-sdk"

import { PRODUCT_CUSTOM_FIELD_MODULE } from "../modules/product-custom-field"

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

const CUSTOM_FIELD_KEYS = [
  "stone_type",
  "finish_plating",
  "ring_style",
  "earring_style",
  "plating",
] as const

function normalizeStringArray(value: unknown): string[] | null | undefined {
  if (Array.isArray(value)) {
    const items = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)

    return items.length ? items : null
  }

  return value === null ? null : undefined
}

function pickCustomFields(
  additionalData?: Record<string, unknown> | null
): ProductCustomFields | null {
  if (!additionalData) {
    return null
  }

  const fields = CUSTOM_FIELD_KEYS.reduce<ProductCustomFields>((acc, key) => {
    const value = normalizeStringArray(additionalData[key])

    if (value !== undefined) {
      acc[key] = value
    }

    return acc
  }, {})

  return Object.keys(fields).length ? fields : null
}

async function upsertProductCustomFields(
  input: {
    products: { id: string }[]
    additional_data?: Record<string, unknown> | null
  },
  container: any
) {
  const fields = pickCustomFields(input.additional_data)

  if (!fields || !input.products.length) {
    return new StepResponse([])
  }

  const service = container.resolve(PRODUCT_CUSTOM_FIELD_MODULE) as any
  const productIds = input.products.map((product) => product.id)
  const existing = (await service.listProductCustomFields({
    product_id: productIds,
  })) as ProductCustomFieldRecord[]
  const existingByProductId = new Map(
    existing.map((record) => [record.product_id, record])
  )

  for (const productId of productIds) {
    const record = existingByProductId.get(productId)

    if (record) {
      await service.updateProductCustomFields({
        id: record.id,
        ...fields,
      })
      continue
    }

    await service.createProductCustomFields({
      product_id: productId,
      ...fields,
    })
  }

  return new StepResponse(productIds)
}

createProductsWorkflow.hooks.productsCreated(async (input, { container }) => {
  return upsertProductCustomFields(input as any, container)
})

updateProductsWorkflow.hooks.productsUpdated(async (input, { container }) => {
  return upsertProductCustomFields(input as any, container)
})

deleteProductsWorkflow.hooks.productsDeleted(async (input, { container }) => {
  const service = container.resolve(PRODUCT_CUSTOM_FIELD_MODULE) as any
  const records = (await service.listProductCustomFields({
    product_id: input.ids,
  })) as ProductCustomFieldRecord[]

  if (!records.length) {
    return new StepResponse([])
  }

  const ids = records.map((record) => record.id)

  await service.deleteProductCustomFields(ids)

  return new StepResponse(ids)
})
