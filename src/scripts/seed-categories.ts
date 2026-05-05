import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const categoriesFromDoc = [
  {"L1 Category":"Rings","URL Slug":"/rings"},
  {"L1 Category":"Rings","L2 Subcategory":"Solitaire Rings","URL Slug":"/rings/solitaire"},
  {"L1 Category":"Rings","L2 Subcategory":"Halo Rings","URL Slug":"/rings/halo"},
  {"L1 Category":"Rings","L2 Subcategory":"Cocktail Rings","URL Slug":"/rings/cocktail"},
  {"L1 Category":"Rings","L2 Subcategory":"Signet Rings","URL Slug":"/rings/signet"},
  {"L1 Category":"Rings","L2 Subcategory":"Band Rings","URL Slug":"/rings/band"},
  {"L1 Category":"Rings","L2 Subcategory":"Eternity Rings","URL Slug":"/rings/eternity"},
  {"L1 Category":"Rings","L2 Subcategory":"Bridal Sets","URL Slug":"/rings/bridal"},
  {"L1 Category":"Rings","L2 Subcategory":"Stackable Rings","URL Slug":"/rings/stackable"},
  {"L1 Category":"Rings","L2 Subcategory":"Bypass Rings","URL Slug":"/rings/bypass"},
  {"L1 Category":"Rings","L2 Subcategory":"Cluster Rings","URL Slug":"/rings/cluster"},

  {"L1 Category":"Earrings","URL Slug":"/earrings"},
  {"L1 Category":"Earrings","L2 Subcategory":"Stud Earrings","URL Slug":"/earrings/studs"},
  {"L1 Category":"Earrings","L2 Subcategory":"Drop & Dangle","URL Slug":"/earrings/drop-dangle"},
  {"L1 Category":"Earrings","L2 Subcategory":"Hoop & Huggie","URL Slug":"/earrings/hoop-huggie"},
  {"L1 Category":"Earrings","L2 Subcategory":"Leverback","URL Slug":"/earrings/leverback"},

  {"L1 Category":"Necklaces","URL Slug":"/necklaces"},
  {"L1 Category":"Necklaces","L2 Subcategory":"Pendant Necklaces","URL Slug":"/necklaces/pendants"},
  {"L1 Category":"Necklaces","L2 Subcategory":"Chain Necklaces","URL Slug":"/necklaces/chains"},

  {"L1 Category":"Bracelets","URL Slug":"/bracelets"},
  {"L1 Category":"Bracelets","L2 Subcategory":"Chain Bracelets","URL Slug":"/bracelets/chain"},
  {"L1 Category":"Bracelets","L2 Subcategory":"Bangles & Cuffs","URL Slug":"/bracelets/bangles-cuffs"},
  {"L1 Category":"Bracelets","L2 Subcategory":"Tennis Bracelets","URL Slug":"/bracelets/tennis"},

  {"L1 Category":"Brooches","URL Slug":"/brooches"},

  {"L1 Category":"Collections","L2 Subcategory":"Assorted Ring Sets","URL Slug":"/collections/assorted-rings"},
  {"L1 Category":"Collections","L2 Subcategory":"Masonic Collection","URL Slug":"/collections/masonic"},
  {"L1 Category":"Collections","L2 Subcategory":"Military Collection","URL Slug":"/collections/military"},
  {"L1 Category":"Collections","L2 Subcategory":"Crosses Collection","URL Slug":"/collections/crosses"},
  {"L1 Category":"Collections","L2 Subcategory":"Crowns Collection","URL Slug":"/collections/crowns"},
  {"L1 Category":"Collections","L2 Subcategory":"Hearts Collection","URL Slug":"/collections/hearts"},
  {"L1 Category":"Collections","L2 Subcategory":"Horseshoes Collection","URL Slug":"/collections/horseshoes"},
  {"L1 Category":"Collections","L2 Subcategory":"Infinity Collection","URL Slug":"/collections/infinity"},
  {"L1 Category":"Collections","L2 Subcategory":"Initials Collection","URL Slug":"/collections/initials"},
  {"L1 Category":"Collections","L2 Subcategory":"Keys Collection","URL Slug":"/collections/keys"},
  {"L1 Category":"Collections","L2 Subcategory":"Knots & Bows Collection","URL Slug":"/collections/knots-and-bows"},
  {"L1 Category":"Collections","L2 Subcategory":"Clovers Collection","URL Slug":"/collections/clovers"},
  {"L1 Category":"Collections","L2 Subcategory":"Flowers Collection","URL Slug":"/collections/flowers"},
  {"L1 Category":"Collections","L2 Subcategory":"Numbers Collection","URL Slug":"/collections/numbers"},
  {"L1 Category":"Collections","L2 Subcategory":"Skulls Collection","URL Slug":"/collections/skulls"},
  {"L1 Category":"Collections","L2 Subcategory":"Stars & Moons Collection","URL Slug":"/collections/stars-and-moons"},
  {"L1 Category":"Collections","L2 Subcategory":"Wishbones Collection","URL Slug":"/collections/wishbones"},

  {"L1 Category":"Occasions","L2 Subcategory":"Valentine’s Day","URL Slug":"/collections/valentines-day"},
  {"L1 Category":"Occasions","L2 Subcategory":"St. Patrick’s Day","URL Slug":"/collections/st-patricks-day"},
  {"L1 Category":"Occasions","L2 Subcategory":"Easter Day","URL Slug":"/collections/easter"},
  {"L1 Category":"Occasions","L2 Subcategory":"Mother’s Day","URL Slug":"/collections/mothers-day"},
  {"L1 Category":"Occasions","L2 Subcategory":"Graduation","URL Slug":"/collections/graduation"},
  {"L1 Category":"Occasions","L2 Subcategory":"Father’s Day","URL Slug":"/collections/fathers-day"},
  {"L1 Category":"Occasions","L2 Subcategory":"Halloween","URL Slug":"/collections/halloween"},
  {"L1 Category":"Occasions","L2 Subcategory":"Christmas","URL Slug":"/collections/christmas"},
  {"L1 Category":"Occasions","L2 Subcategory":"Wedding & Bridal","URL Slug":"/collections/wedding-and-bridal"},
  {"L1 Category":"Occasions","L2 Subcategory":"Boho","URL Slug":"/collections/boho"},
  {"L1 Category":"Occasions","L2 Subcategory":"Celtic","URL Slug":"/collections/celtic"},
  {"L1 Category":"Occasions","L2 Subcategory":"Claddagh","URL Slug":"/collections/claddagh"},
  {"L1 Category":"Occasions","L2 Subcategory":"Biker","URL Slug":"/collections/biker"},
  {"L1 Category":"Occasions","L2 Subcategory":"Birthstone","URL Slug":"/collections/birthstone"},
  {"L1 Category":"Occasions","L2 Subcategory":"Minimalist","URL Slug":"/collections/minimalist"},
  {"L1 Category":"Occasions","L2 Subcategory":"Monochromatic","URL Slug":"/collections/monochromatic"},
  {"L1 Category":"Occasions","L2 Subcategory":"Vintage","URL Slug":"/collections/vintage"},
  {"L1 Category":"Occasions","L2 Subcategory":"Religion","URL Slug":"/collections/religion"}
]


type DocCategoryRow = {
  "L1 Category": string
  "L2 Subcategory"?: string
  "URL Slug": string
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function handleFromUrlSlug(urlSlug: string): string {
  const parts = urlSlug.split("/").filter(Boolean)
  return parts.length ? slugify(parts[parts.length - 1]) : ""
}

function parentDefinitions(rows: DocCategoryRow[]) {
  const byName = new Map<string, { name: string; handle: string; metadata: Record<string, unknown> }>()

  rows.forEach((row) => {
    const name = row["L1 Category"].trim()
    const parentOnlyHandle = !row["L2 Subcategory"] ? handleFromUrlSlug(row["URL Slug"]) : ""

    if (!byName.has(name)) {
      byName.set(name, {
        name,
        handle: parentOnlyHandle || slugify(name),
        metadata: {
          source: "category-doc",
          level: 1,
        },
      })
    }
  })

  return Array.from(byName.values())
}

function childDefinitions(rows: DocCategoryRow[], parentIdByName: Map<string, string>) {
  return rows
    .filter((row) => row["L2 Subcategory"])
    .map((row) => {
      const parentName = row["L1 Category"].trim()
      const parentCategoryId = parentIdByName.get(parentName)

      if (!parentCategoryId) {
        throw new Error(`Missing parent category for: ${parentName}`)
      }

      return {
        name: row["L2 Subcategory"]!.trim(),
        handle: handleFromUrlSlug(row["URL Slug"]) || slugify(row["L2 Subcategory"]!),
        parent_category_id: parentCategoryId,
        is_active: true,
        is_internal: false,
        metadata: {
          source: "category-doc",
          level: 2,
          l1_category: parentName,
          url_slug: row["URL Slug"],
        },
      }
    })
}

export default async function createCategories({ container }: ExecArgs) {
  const productModuleService = container.resolve(Modules.PRODUCT)
  const parentCategories = parentDefinitions(categoriesFromDoc)

  const existing = await productModuleService.listProductCategories(
    {},
    { select: ["id", "name", "handle", "parent_category_id"], take: 10000 }
  )
  const existingHandles = new Set(existing.map((category) => category.handle))
  const parentsToCreate = parentCategories.filter(
    (category) => !existingHandles.has(category.handle)
  )

  const createdParents = parentsToCreate.length
    ? await productModuleService.createProductCategories(parentsToCreate)
    : []

  const categoriesAfterParents = await productModuleService.listProductCategories(
    {},
    { select: ["id", "name", "handle", "parent_category_id"], take: 10000 }
  )
  const parentIdByName = new Map(
    parentCategories.map((parent) => {
      const category = categoriesAfterParents.find((item) => item.handle === parent.handle)

      if (!category) {
        throw new Error(`Parent category was not found after creation: ${parent.name}`)
      }

      return [parent.name, category.id]
    })
  )
  const childCategories = childDefinitions(categoriesFromDoc, parentIdByName)
  const existingHandlesAfterParents = new Set(
    categoriesAfterParents.map((category) => category.handle)
  )
  const childrenToCreate = childCategories.filter(
    (category) => !existingHandlesAfterParents.has(category.handle)
  )

  const createdChildren = childrenToCreate.length
    ? await productModuleService.createProductCategories(childrenToCreate)
    : []

  console.log(`Doc rows: ${categoriesFromDoc.length}`)
  console.log(`Parent categories: ${parentCategories.length}`)
  console.log(`Subcategories: ${childCategories.length}`)
  console.log(`Created parent categories: ${createdParents.length}`)
  console.log(`Created subcategories: ${createdChildren.length}`)

  if (createdParents.length || createdChildren.length) {
    console.log("\nCreated categories:")
    ;[...createdParents, ...createdChildren].forEach((category) => {
      console.log(`- ${category.name} | id: ${category.id} | handle: ${category.handle}`)
    })
  }

  const allCategories = await productModuleService.listProductCategories(
    {},
    { select: ["id", "name", "handle", "parent_category_id"], take: 10000 }
  )
  const requestedHandles = new Set(
    [...parentCategories, ...childCategories].map((category) => category.handle)
  )
  const docCategories = allCategories
    .filter((category) => requestedHandles.has(category.handle))
    .sort((a, b) => {
      if (!a.parent_category_id && b.parent_category_id) {
        return -1
      }

      if (a.parent_category_id && !b.parent_category_id) {
        return 1
      }

      return a.name.localeCompare(b.name)
    })

  console.log("\nDoc categories:")
  console.log(JSON.stringify(docCategories, null, 2))

  console.log("\nCATEGORY_ID_MAP = {")
  docCategories.forEach((category) => {
    console.log(`  "${category.name}": "${category.id}",`)
  })
  console.log("}")
}
