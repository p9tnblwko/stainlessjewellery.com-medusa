import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export type ProductCategoryRecord = {
  id: string
  name: string
  handle: string
  parent_category_id?: string | null
}

export type ProductCollectionRecord = {
  id: string
  title: string
  handle: string
}

export type ProductRecord = {
  id: string
  title?: string | null
  handle?: string | null
  categories?: ProductCategoryRecord[] | null
}

export type ScriptOptions = {
  batchSize: number
  limit?: number
  dryRun: boolean
  replaceAllCategories: boolean
}

export type SubcategoryRule = {
  name: string
  handle: string
  pattern: RegExp
}

type RingProductAssignmentConfig = {
  args?: string[]
  container: ExecArgs["container"]
  targetName: string
  targetHandle: string
  matchLabel: string
  namePattern: RegExp
  source: string
  subcategoryRules: SubcategoryRule[]
}

export const DEFAULT_BATCH_SIZE = 250
export const RINGS_HANDLE = "rings"

function parsePositiveInteger(value?: string) {
  const parsed = Number.parseInt(value || "", 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function parseAssignOptions(args: string[] = []): ScriptOptions {
  const options: ScriptOptions = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: process.env.DRY_RUN !== "false",
    replaceAllCategories: false,
  }

  for (const rawArg of args) {
    const arg = rawArg.replace(/^--/, "")
    const [key, value] = arg.includes("=") ? arg.split("=", 2) : [arg, ""]

    if (key === "batch-size" && value) {
      options.batchSize = parsePositiveInteger(value) ?? options.batchSize
    }

    if (key === "limit" && value) {
      options.limit = parsePositiveInteger(value)
    }

    if (key === "apply") {
      options.dryRun = false
    }

    if (key === "dry-run" || key === "dryRun") {
      options.dryRun = value ? value !== "false" : true
    }

    if (key === "replace-all-categories" || key === "replaceAllCategories") {
      options.replaceAllCategories = value ? value !== "false" : true
    }
  }

  return options
}

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function matchesNameOrHandle(
  category: ProductCategoryRecord,
  name: string,
  handle: string
) {
  return (
    category.handle === handle ||
    slugify(category.name) === handle ||
    category.name.toLowerCase() === name.toLowerCase()
  )
}

export function inferSubcategory(title: string, rules: SubcategoryRule[]) {
  return rules.find((rule) => rule.pattern.test(title))
}

export function collectDescendantIds(
  categories: ProductCategoryRecord[],
  parentId: string
) {
  const descendantIds = new Set<string>()
  let changed = true

  while (changed) {
    changed = false

    categories.forEach((category) => {
      const parentCategoryId = category.parent_category_id

      if (
        parentCategoryId &&
        (parentCategoryId === parentId || descendantIds.has(parentCategoryId)) &&
        !descendantIds.has(category.id)
      ) {
        descendantIds.add(category.id)
        changed = true
      }
    })
  }

  return descendantIds
}

export function categoriesByIds(
  categories: ProductCategoryRecord[],
  categoryIds: Set<string>
) {
  return categories
    .filter((category) => categoryIds.has(category.id))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function formatCategoryScope(categories: ProductCategoryRecord[]) {
  return categories
    .map((category) => `${category.name} (${category.handle})`)
    .join(", ")
}

export function sameCategoryIds(left: string[], right: string[]) {
  const normalizedLeft = [...new Set(left)].sort()
  const normalizedRight = [...new Set(right)].sort()

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  )
}

export function buildCategoryIds(
  product: ProductRecord,
  categoryIdsToRemove: Set<string>,
  targetCategoryIds: string[],
  replaceAllCategories: boolean
) {
  if (replaceAllCategories) {
    return [...new Set(targetCategoryIds)]
  }

  const currentCategoryIds =
    product.categories?.map((category) => category.id) ?? []
  const preservedCategoryIds = currentCategoryIds.filter(
    (categoryId) => !categoryIdsToRemove.has(categoryId)
  )

  return [...new Set([...preservedCategoryIds, ...targetCategoryIds])]
}

export async function getAllCategories(productService: any) {
  return (await productService.listProductCategories(
    {},
    {
      select: ["id", "name", "handle", "parent_category_id"],
      take: 10000,
    }
  )) as ProductCategoryRecord[]
}

export async function getOrCreateCategory(
  productService: any,
  categories: ProductCategoryRecord[],
  category: {
    name: string
    handle: string
    parentCategoryId?: string
    source: string
  },
  dryRun = false
) {
  const existing = categories.find(
    (item) =>
      (!category.parentCategoryId ||
        item.parent_category_id === category.parentCategoryId) &&
      matchesNameOrHandle(item, category.name, category.handle)
  )

  if (existing) {
    return existing
  }

  if (dryRun) {
    if (category.parentCategoryId) {
      return undefined
    }

    throw new Error(
      `Product category was not found: ${category.handle}. Run without dry-run to create it, or run the category seed first.`
    )
  }

  const [created] = (await productService.createProductCategories([
    {
      name: category.name,
      handle: category.handle,
      parent_category_id: category.parentCategoryId,
      is_active: true,
      is_internal: false,
      metadata: {
        source: category.source,
      },
    },
  ])) as ProductCategoryRecord[]

  categories.push(created)

  return created
}

export async function findCollectionByTitleOrHandle(
  productService: any,
  title: string,
  handle: string
) {
  const collections = (await productService.listProductCollections(
    {},
    { select: ["id", "title", "handle"], take: 10000 }
  )) as ProductCollectionRecord[]

  return collections.find(
    (collection) => collection.title === title || collection.handle === handle
  )
}

export async function assignRingProductsToCategory({
  args,
  container,
  targetName,
  targetHandle,
  matchLabel,
  namePattern,
  source,
  subcategoryRules,
}: RingProductAssignmentConfig) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any
  const options = parseAssignOptions(args)
  const categories = await getAllCategories(productService)
  const ringsCategory = categories.find((category) =>
    matchesNameOrHandle(category, "Rings", RINGS_HANDLE)
  )

  if (!ringsCategory) {
    throw new Error(`Product category was not found: ${RINGS_HANDLE}`)
  }

  const targetCategory = await getOrCreateCategory(
    productService,
    categories,
    {
      name: targetName,
      handle: targetHandle,
      source,
    },
    options.dryRun
  )

  if (!targetCategory) {
    throw new Error(`Product category was not found: ${targetHandle}`)
  }

  const ringCategoryIds = collectDescendantIds(categories, ringsCategory.id)
  ringCategoryIds.add(ringsCategory.id)
  const ringCategories = categoriesByIds(categories, ringCategoryIds)

  let scanned = 0
  let matchedByName = 0
  let updated = 0
  let unchanged = 0
  let totalProducts = 0

  logger.info(`Scanning for ${matchLabel} products assigned to Rings and subcategories...`)
  logger.info(`Rings category: ${ringsCategory.name} (${ringsCategory.id})`)
  logger.info(
    `Rings scope: ${ringCategories.length} categories - ${formatCategoryScope(
      ringCategories
    )}`
  )
  logger.info(`${targetName} category: ${targetCategory.name} (${targetCategory.id})`)
  logger.info(`Dry run: ${options.dryRun ? "yes" : "no"}`)
  logger.info(
    `Replace all categories: ${options.replaceAllCategories ? "yes" : "no"}`
  )

  for (let offset = 0; ; offset += options.batchSize) {
    const remaining = options.limit ? options.limit - scanned : undefined

    if (remaining !== undefined && remaining <= 0) {
      break
    }

    const take =
      remaining !== undefined
        ? Math.min(options.batchSize, remaining)
        : options.batchSize
    const [products, count] = (await productService.listAndCountProducts(
      {
        categories: {
          id: [...ringCategoryIds],
        },
      },
      {
        select: ["id", "title", "handle"],
        relations: ["categories"],
        skip: offset,
        take,
      }
    )) as [ProductRecord[], number]

    totalProducts = options.limit ? Math.min(count, options.limit) : count

    if (!products.length) {
      break
    }

    const updates: Array<{ id: string; category_ids: string[] }> = []

    for (const product of products) {
      scanned += 1

      const title = product.title || ""

      if (!namePattern.test(title)) {
        continue
      }

      matchedByName += 1

      const subcategoryRule = inferSubcategory(title, subcategoryRules)
      const subcategory = subcategoryRule
        ? await getOrCreateCategory(
            productService,
            categories,
            {
              name: subcategoryRule.name,
              handle: subcategoryRule.handle,
              parentCategoryId: targetCategory.id,
              source,
            },
            options.dryRun
          )
        : undefined
      const targetCategoryIds = [
        targetCategory.id,
        ...(subcategory ? [subcategory.id] : []),
      ]
      const nextCategoryIds = buildCategoryIds(
        product,
        ringCategoryIds,
        targetCategoryIds,
        options.replaceAllCategories
      )
      const currentCategoryIds =
        product.categories?.map((category) => category.id) ?? []

      if (sameCategoryIds(currentCategoryIds, nextCategoryIds)) {
        unchanged += 1
        continue
      }

      updates.push({
        id: product.id,
        category_ids: nextCategoryIds,
      })

      logger.info(
        `${options.dryRun ? "[dry-run] " : ""}${product.handle ?? product.id}: ${
          product.title
        } -> ${subcategory ? `${targetName} / ${subcategory.name}` : targetName}`
      )
    }

    if (updates.length) {
      if (!options.dryRun) {
        await productService.upsertProducts(updates)
      }

      updated += updates.length
    }

    logger.info(`Scanned ${scanned}/${totalProducts} products...`)

    if (scanned >= totalProducts || products.length < take) {
      break
    }
  }

  logger.info(
    `Done. Scanned ${scanned} Rings products. Matched ${matchedByName} ${matchLabel} names. ${
      options.dryRun ? "Would update" : "Updated"
    } ${updated}, unchanged ${unchanged}.`
  )
}
