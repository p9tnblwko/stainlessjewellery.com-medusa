import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type ProductCategoryRecord = {
  id: string
  name: string
  handle: string
}

type ProductCollectionRecord = {
  id: string
  title: string
  handle: string
}

type ProductRecord = {
  id: string
  title: string
  handle: string
  categories?: ProductCategoryRecord[] | null
}

const CATEGORY_NAME = "Cufflinks"
const CATEGORY_HANDLE = "cufflinks"
const COLLECTION_TITLE = "Cufflinks"
const BATCH_SIZE = 250

async function getOrCreateCufflinksCategory(productService: any) {
  const existingCategories = (await productService.listProductCategories(
    { handle: CATEGORY_HANDLE },
    { select: ["id", "name", "handle"], take: 1 }
  )) as ProductCategoryRecord[]

  if (existingCategories.length) {
    return existingCategories[0]
  }

  const createdCategories = (await productService.createProductCategories([
    {
      name: CATEGORY_NAME,
      handle: CATEGORY_HANDLE,
      is_active: true,
      is_internal: false,
      metadata: {
        source: "assign-cufflinks-category-script",
      },
    },
  ])) as ProductCategoryRecord[]

  return createdCategories[0]
}

async function getCufflinksCollection(productService: any) {
  const collections = (await productService.listProductCollections(
    {},
    { select: ["id", "title", "handle"], take: 10000 }
  )) as ProductCollectionRecord[]

  return collections.find(
    (collection) =>
      collection.title === COLLECTION_TITLE || collection.handle === CATEGORY_HANDLE
  )
}

export default async function assignCufflinksCategory({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any

  const category = await getOrCreateCufflinksCategory(productService)
  const collection = await getCufflinksCollection(productService)

  if (!collection) {
    throw new Error(`Product collection was not found: ${COLLECTION_TITLE}`)
  }

  logger.info(
    `Using category ${category.name} (${category.id}) for collection ${collection.title} (${collection.id}).`
  )

  let scanned = 0
  let updated = 0
  let unchanged = 0
  let totalProducts = 0

  for (let offset = 0; ; offset += BATCH_SIZE) {
    const [products, count] = (await productService.listAndCountProducts(
      { collection_id: collection.id },
      {
        select: ["id", "title", "handle"],
        relations: ["categories"],
        skip: offset,
        take: BATCH_SIZE,
      }
    )) as [ProductRecord[], number]

    totalProducts = count

    if (!products.length) {
      break
    }

    for (const product of products) {
      scanned += 1

      const currentCategoryIds =
        product.categories?.map((currentCategory) => currentCategory.id) ?? []
      const alreadyOnlyCufflinks =
        currentCategoryIds.length === 1 && currentCategoryIds[0] === category.id

      if (alreadyOnlyCufflinks) {
        unchanged += 1
        continue
      }

      await productService.updateProducts(product.id, {
        category_ids: [category.id],
      })

      updated += 1
      logger.info(
        `Set ${CATEGORY_NAME} as the only category for ${product.title} (${product.id}).`
      )
    }

    logger.info(`Processed ${scanned}/${totalProducts} products...`)

    if (scanned >= count) {
      break
    }
  }

  logger.info(
    `Done. Scanned ${scanned} products from ${COLLECTION_TITLE}. Updated ${updated}, already assigned ${unchanged}.`
  )
}
