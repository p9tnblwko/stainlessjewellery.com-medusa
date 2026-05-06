import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { PRODUCT_CUSTOM_FIELD_MODULE } from "../modules/product-custom-field"

type CustomFieldKey =
  | "stone_type"
  | "finish_plating"
  | "ring_style"
  | "earring_style"

type ProductVariantWithMetadata = {
  id: string
  product_id: string
  metadata?: Record<string, unknown> | null
}

type ProductCustomFieldRecord = Partial<Record<CustomFieldKey, string[] | null>> & {
  id: string
  product_id: string
}

const CUSTOM_FIELD_KEYS: CustomFieldKey[] = [
  "stone_type",
  "finish_plating",
  "ring_style",
  "earring_style",
]

const BATCH_SIZE = 500

function normalizeMetadataValues(value: unknown): string[] {
  if (value === null || value === undefined) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap(normalizeMetadataValues)
  }

  if (typeof value !== "string") {
    return []
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return []
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed)

      if (Array.isArray(parsed)) {
        return normalizeMetadataValues(parsed)
      }
    } catch {
      // Fall through to comma splitting for non-JSON array-like values.
    }
  }

  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function addValues(
  target: Partial<Record<CustomFieldKey, Set<string>>>,
  key: CustomFieldKey,
  values: string[]
) {
  if (!values.length) {
    return
  }

  target[key] ??= new Set()

  for (const value of values) {
    target[key].add(value)
  }
}

export default async function syncProductCustomFields({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any
  const customFieldService = container.resolve(PRODUCT_CUSTOM_FIELD_MODULE) as any
  const fieldsByProductId = new Map<
    string,
    Partial<Record<CustomFieldKey, Set<string>>>
  >()
  let processedVariants = 0
  let totalVariants = 0

  logger.info("Reading product variant metadata...")

  for (let offset = 0; ; offset += BATCH_SIZE) {
    const [variants, count] =
      (await productService.listAndCountProductVariants(
        {},
        {
          select: ["id", "product_id", "metadata"],
          skip: offset,
          take: BATCH_SIZE,
        }
      )) as [ProductVariantWithMetadata[], number]

    totalVariants = count

    if (!variants.length) {
      break
    }

    for (const variant of variants) {
      if (!variant.product_id || !variant.metadata) {
        continue
      }

      const fields = fieldsByProductId.get(variant.product_id) ?? {}

      for (const key of CUSTOM_FIELD_KEYS) {
        addValues(fields, key, normalizeMetadataValues(variant.metadata[key]))
      }

      if (Object.keys(fields).length) {
        fieldsByProductId.set(variant.product_id, fields)
      }
    }

    processedVariants += variants.length
    logger.info(`Processed ${processedVariants}/${totalVariants} variants...`)

    if (processedVariants >= count) {
      break
    }
  }

  const productIds = [...fieldsByProductId.keys()]

  if (!productIds.length) {
    logger.info("No custom field metadata found on variants.")
    return
  }

  const existingRecords = (await customFieldService.listProductCustomFields({
    product_id: productIds,
  })) as ProductCustomFieldRecord[]
  const existingByProductId = new Map(
    existingRecords.map((record) => [record.product_id, record])
  )
  const createInput: Array<{ product_id: string } & Partial<Record<CustomFieldKey, string[]>>> = []
  const updateInput: Array<{ id: string } & Partial<Record<CustomFieldKey, string[]>>> = []

  for (const [productId, fields] of fieldsByProductId) {
    const payload = CUSTOM_FIELD_KEYS.reduce<Partial<Record<CustomFieldKey, string[]>>>(
      (acc, key) => {
        const values = fields[key]

        if (values?.size) {
          acc[key] = [...values]
        }

        return acc
      },
      {}
    )

    if (!Object.keys(payload).length) {
      continue
    }

    const existing = existingByProductId.get(productId)

    if (existing) {
      updateInput.push({
        id: existing.id,
        ...payload,
      })
      continue
    }

    createInput.push({
      product_id: productId,
      ...payload,
    })
  }

  if (createInput.length) {
    await customFieldService.createProductCustomFields(createInput)
  }

  if (updateInput.length) {
    await customFieldService.updateProductCustomFields(updateInput)
  }

  logger.info(
    `Synced custom fields for ${createInput.length + updateInput.length} products. Created ${createInput.length}, updated ${updateInput.length}.`
  )
}
