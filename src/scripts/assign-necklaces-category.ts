import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type ProductCategoryRecord = {
  id: string
  name: string
  handle: string
  parent_category_id?: string | null
}

type ProductRecord = {
  id: string
  title?: string | null
  handle?: string | null
  categories?: ProductCategoryRecord[] | null
}

type ScriptOptions = {
  batchSize: number
  limit?: number
  dryRun: boolean
  replaceAllCategories: boolean
}

type SubcategoryRule = {
  name: string
  handle: string
  pattern: RegExp
}

const DEFAULT_BATCH_SIZE = 250
const RINGS_HANDLE = "rings"
const NECKLACES_NAME = "Necklaces"
const NECKLACES_HANDLE = "necklaces"
const NECKLACE_NAME_PATTERN =
  /\b(?:necklace|necklaces|pendant|pendants|choker|chokers|collar\s+necklace|collar\s+necklaces)\b/i

const NECKLACE_SUBCATEGORY_RULES: SubcategoryRule[] = [
  {
    name: "Pendant Necklaces",
    handle: "pendants",
    pattern: /\b(?:pendant|pendants)\b/i,
  },
  {
    name: "Chain Necklaces",
    handle: "chains",
    pattern: /\b(?:chain|chains|link|links|station|stations)\b/i,
  },
]

function parsePositiveInteger(value?: string) {
  const parsed = Number.parseInt(value || "", 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function parseOptions(args: string[] = []): ScriptOptions {
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

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function matchesNameOrHandle(
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

function inferNecklaceSubcategory(title: string) {
  return NECKLACE_SUBCATEGORY_RULES.find((rule) => rule.pattern.test(title))
}

function collectDescendantIds(
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

function categoriesByIds(
  categories: ProductCategoryRecord[],
  categoryIds: Set<string>
) {
  return categories
    .filter((category) => categoryIds.has(category.id))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function formatCategoryScope(categories: ProductCategoryRecord[]) {
  return categories
    .map((category) => `${category.name} (${category.handle})`)
    .join(", ")
}

function sameCategoryIds(left: string[], right: string[]) {
  const normalizedLeft = [...new Set(left)].sort()
  const normalizedRight = [...new Set(right)].sort()

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  )
}

function buildCategoryIds(
  product: ProductRecord,
  ringCategoryIds: Set<string>,
  targetCategoryIds: string[],
  replaceAllCategories: boolean
) {
  if (replaceAllCategories) {
    return [...new Set(targetCategoryIds)]
  }

  const currentCategoryIds =
    product.categories?.map((category) => category.id) ?? []
  const preservedCategoryIds = currentCategoryIds.filter(
    (categoryId) => !ringCategoryIds.has(categoryId)
  )

  return [...new Set([...preservedCategoryIds, ...targetCategoryIds])]
}

async function getAllCategories(productService: any) {
  return (await productService.listProductCategories(
    {},
    {
      select: ["id", "name", "handle", "parent_category_id"],
      take: 10000,
    }
  )) as ProductCategoryRecord[]
}

async function getOrCreateNecklacesCategory(
  productService: any,
  categories: ProductCategoryRecord[],
  dryRun: boolean
) {
  const existing = categories.find((category) =>
    matchesNameOrHandle(category, NECKLACES_NAME, NECKLACES_HANDLE)
  )

  if (existing) {
    return existing
  }

  if (dryRun) {
    throw new Error(
      `Product category was not found: ${NECKLACES_HANDLE}. Run without dry-run to create it, or run the category seed first.`
    )
  }

  const [created] = (await productService.createProductCategories([
    {
      name: NECKLACES_NAME,
      handle: NECKLACES_HANDLE,
      is_active: true,
      is_internal: false,
      metadata: {
        source: "assign-necklaces-category-script",
      },
    },
  ])) as ProductCategoryRecord[]

  categories.push(created)

  return created
}

async function getOrCreateNecklaceSubcategory(
  productService: any,
  categories: ProductCategoryRecord[],
  necklacesCategory: ProductCategoryRecord,
  rule: SubcategoryRule,
  dryRun: boolean
) {
  const existing = categories.find(
    (category) =>
      category.parent_category_id === necklacesCategory.id &&
      matchesNameOrHandle(category, rule.name, rule.handle)
  )

  if (existing) {
    return existing
  }

  if (dryRun) {
    return undefined
  }

  const [created] = (await productService.createProductCategories([
    {
      name: rule.name,
      handle: rule.handle,
      parent_category_id: necklacesCategory.id,
      is_active: true,
      is_internal: false,
      metadata: {
        source: "assign-necklaces-category-script",
      },
    },
  ])) as ProductCategoryRecord[]

  categories.push(created)

  return created
}

export default async function assignNecklacesCategory({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any
  const options = parseOptions(args)
  const categories = await getAllCategories(productService)
  const ringsCategory = categories.find((category) =>
    matchesNameOrHandle(category, "Rings", RINGS_HANDLE)
  )

  if (!ringsCategory) {
    throw new Error(`Product category was not found: ${RINGS_HANDLE}`)
  }

  const necklacesCategory = await getOrCreateNecklacesCategory(
    productService,
    categories,
    options.dryRun
  )
  const ringCategoryIds = collectDescendantIds(categories, ringsCategory.id)
  ringCategoryIds.add(ringsCategory.id)
  const ringCategories = categoriesByIds(categories, ringCategoryIds)

  let scanned = 0
  let matchedByName = 0
  let updated = 0
  let unchanged = 0
  let totalProducts = 0

  logger.info("Scanning for necklace products assigned to Rings and subcategories...")
  logger.info(`Rings category: ${ringsCategory.name} (${ringsCategory.id})`)
  logger.info(
    `Rings scope: ${ringCategories.length} categories - ${formatCategoryScope(
      ringCategories
    )}`
  )
  logger.info(
    `Necklaces category: ${necklacesCategory.name} (${necklacesCategory.id})`
  )
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

      if (!NECKLACE_NAME_PATTERN.test(title)) {
        continue
      }

      matchedByName += 1

      const subcategoryRule = inferNecklaceSubcategory(title)
      const subcategory = subcategoryRule
        ? await getOrCreateNecklaceSubcategory(
            productService,
            categories,
            necklacesCategory,
            subcategoryRule,
            options.dryRun
          )
        : undefined
      const targetCategoryIds = [
        necklacesCategory.id,
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
        } -> ${
          subcategory
            ? `${NECKLACES_NAME} / ${subcategory.name}`
            : NECKLACES_NAME
        }`
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
    `Done. Scanned ${scanned} Rings products. Matched ${matchedByName} necklace names. ${
      options.dryRun ? "Would update" : "Updated"
    } ${updated}, unchanged ${unchanged}.`
  )
}
