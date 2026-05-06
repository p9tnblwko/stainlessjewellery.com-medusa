import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

type ProductCollection = {
  id: string
  title: string
}

export default async function printCollectionIdMap({ container }: ExecArgs) {
  const productModuleService = container.resolve(Modules.PRODUCT)

  const collections = await productModuleService.listProductCollections(
    {},
    { select: ["id", "title"], take: 10000 }
  )

  const sortedCollections = collections.sort(
    (a: ProductCollection, b: ProductCollection) =>
      a.title.localeCompare(b.title)
  )

  console.log("COLLECTION_ID_MAP = {")
  sortedCollections.forEach((collection: ProductCollection) => {
    console.log(`  "${collection.title}": "${collection.id}",`)
  })
  console.log("}")
}
