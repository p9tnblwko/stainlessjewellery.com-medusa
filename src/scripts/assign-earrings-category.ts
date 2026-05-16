import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

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
const EARRINGS_NAME = "Earrings"
const EARRINGS_HANDLE = "earrings"
const EARRING_NAME_PATTERN =
  /\b(?:ear\s*ring|earring|earrings|ear\s*cuff|earcuff|ear\s*jacket|earjacket)s?\b/i

const EARRING_SUBCATEGORY_RULES: SubcategoryRule[] = [
  {
    name: "Stud Earrings",
    handle: "studs",
    pattern: /\b(?:stud|studs)\b/i,
  },
  {
    name: "Drop & Dangle",
    handle: "drop-dangle",
    pattern: /\b(?:drop|drops|dangle|dangles|dangling|chandelier|threader|teardrop)\b/i,
  },
  {
    name: "Hoop & Huggie",
    handle: "hoop-huggie",
    pattern: /\b(?:hoop|hoops|huggie|huggies|huggy|huggys)\b/i,
  },
  {
    name: "Leverback",
    handle: "leverback",
    pattern: /\b(?:leverback|lever\s*back)\b/i,
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

function inferEarringSubcategory(title: string) {
  return EARRING_SUBCATEGORY_RULES.find((rule) => rule.pattern.test(title))
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

async function getAllCategories(productService: any) {
  return (await productService.listProductCategories(
    {},
    {
      select: ["id", "name", "handle", "parent_category_id"],
      take: 10000,
    }
  )) as ProductCategoryRecord[]
}

async function getOrCreateEarringsCategory(
  productService: any,
  categories: ProductCategoryRecord[],
  dryRun: boolean
) {
  const existing = categories.find((category) =>
    matchesNameOrHandle(category, EARRINGS_NAME, EARRINGS_HANDLE)
  )

  if (existing) {
    return existing
  }

  if (dryRun) {
    throw new Error(
      `Product category was not found: ${EARRINGS_HANDLE}. Run without dry-run to create it, or run the category seed first.`
    )
  }

  const [created] = (await productService.createProductCategories([
    {
      name: EARRINGS_NAME,
      handle: EARRINGS_HANDLE,
      is_active: true,
      is_internal: false,
      metadata: {
        source: "assign-earrings-category-script",
      },
    },
  ])) as ProductCategoryRecord[]

  categories.push(created)

  return created
}

async function getOrCreateEarringSubcategory(
  productService: any,
  categories: ProductCategoryRecord[],
  earringsCategory: ProductCategoryRecord,
  rule: SubcategoryRule,
  dryRun: boolean
) {
  const existing = categories.find(
    (category) =>
      category.parent_category_id === earringsCategory.id &&
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
      parent_category_id: earringsCategory.id,
      is_active: true,
      is_internal: false,
      metadata: {
        source: "assign-earrings-category-script",
      },
    },
  ])) as ProductCategoryRecord[]

  categories.push(created)

  return created
}

function hasAnyCategory(product: ProductRecord, categoryIds: Set<string>) {
  return Boolean(
    product.categories?.some((category) => categoryIds.has(category.id))
  )
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

export default async function assignEarringsCategory({
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

  const earringsCategory = await getOrCreateEarringsCategory(
    productService,
    categories,
    options.dryRun
  )
  const ringCategoryIds = collectDescendantIds(categories, ringsCategory.id)
  ringCategoryIds.add(ringsCategory.id)

  let scanned = 0
  let matchedByName = 0
  let matchedInRings = 0
  let updated = 0
  let unchanged = 0
  let skippedOutsideRings = 0
  let totalProducts = 0

  logger.info("Scanning for earring products assigned to Rings...")
  logger.info(`Rings category: ${ringsCategory.name} (${ringsCategory.id})`)
  logger.info(
    `Earrings category: ${earringsCategory.name} (${earringsCategory.id})`
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
      {},
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

      if (!EARRING_NAME_PATTERN.test(title)) {
        continue
      }

      matchedByName += 1

      if (!hasAnyCategory(product, ringCategoryIds)) {
        skippedOutsideRings += 1
        continue
      }

      matchedInRings += 1

      const subcategoryRule = inferEarringSubcategory(title)
      const subcategory = subcategoryRule
        ? await getOrCreateEarringSubcategory(
            productService,
            categories,
            earringsCategory,
            subcategoryRule,
            options.dryRun
          )
        : undefined
      const targetCategoryIds = [
        earringsCategory.id,
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
        } -> ${subcategory ? `${EARRINGS_NAME} / ${subcategory.name}` : EARRINGS_NAME}`
      )
    }

    if (updates.length) {
      if (!options.dryRun) {
        await updateProductsWorkflow(container).run({
          input: {
            products: updates,
          },
        })
      }

      updated += updates.length
    }

    logger.info(`Scanned ${scanned}/${totalProducts} products...`)

    if (scanned >= totalProducts || products.length < take) {
      break
    }
  }

  logger.info(
    `Done. Scanned ${scanned} products. Matched ${matchedByName} earring names; ${matchedInRings} were in Rings. ${
      options.dryRun ? "Would update" : "Updated"
    } ${updated}, unchanged ${unchanged}, skipped outside Rings ${skippedOutsideRings}.`
  )
}
