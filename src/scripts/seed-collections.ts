import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

export default async function seedCollections({ container }: ExecArgs) {
  const productModuleService = container.resolve(Modules.PRODUCT)

  const collections = [
    { title: "first", handle: "first" },
    // { title: "second", handle: "second" },
    // { title: "third", handle: "third" },
  ]

  // ✅ correct method name
  const existing = await productModuleService.listProductCollections()
  const existingHandles = new Set(existing.map(c => c.handle))

  const toCreate = collections.filter(c => !existingHandles.has(c.handle))

  if (toCreate.length) {
    // ✅ correct method name
    const created = await productModuleService.createProductCollections(toCreate)

    created.forEach(c => {
      console.log(`Created: ${c.title} (id: ${c.id})`)
    })
  }

  // ✅ list again
  const allCollections = await productModuleService.listProductCollections()

  console.log("\nAll collections:")
  allCollections.forEach(c => {
    console.log(`- ${c.title} | id: ${c.id} | handle: ${c.handle}`)
  })
}