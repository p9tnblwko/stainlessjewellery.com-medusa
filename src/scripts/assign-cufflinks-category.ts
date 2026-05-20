import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  DEFAULT_BATCH_SIZE,
  findCollectionByTitleOrHandle,
  getAllCategories,
  getOrCreateCategory,
  sameCategoryIds,
  type ProductRecord,
} from "./utils/assign-category"

const CATEGORY_NAME = "Cufflinks"
const CATEGORY_HANDLE = "cufflinks"
const COLLECTION_TITLE = "Cufflinks"
const SOURCE = "assign-cufflinks-category-script"

export default async function assignCufflinksCategory({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any
  const categories = await getAllCategories(productService)
  const category = await getOrCreateCategory(
    productService,
    categories,
    {
      name: CATEGORY_NAME,
      handle: CATEGORY_HANDLE,
      source: SOURCE,
    },
    false
  )
  const collection = await findCollectionByTitleOrHandle(
    productService,
    COLLECTION_TITLE,
    CATEGORY_HANDLE
  )

  if (!category) {
    throw new Error(`Product category was not found: ${CATEGORY_HANDLE}`)
  }

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

  for (let offset = 0; ; offset += DEFAULT_BATCH_SIZE) {
    const [products, count] = (await productService.listAndCountProducts(
      { collection_id: collection.id },
      {
        select: ["id", "title", "handle"],
        relations: ["categories"],
        skip: offset,
        take: DEFAULT_BATCH_SIZE,
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

      if (sameCategoryIds(currentCategoryIds, [category.id])) {
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
