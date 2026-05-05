import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

type TagSource = {
  title: string
}

type ProductTag = {
  id?: string
  value: string
}

const TAGS: TagSource[] = [
  { title: "accessory" },
  { title: "anchor" },
  { title: "angel" },
  { title: "animal" },
  { title: "anklet" },
  { title: "antique-finish" },
  { title: "arrow" },
  { title: "art deco" },
  { title: "bangle" },
  { title: "biker" },
  { title: "bird" },
  { title: "black-plated" },
  { title: "boho" },
  { title: "bracelet" },
  { title: "brass" },
  { title: "bridal" },
  { title: "brooch" },
  { title: "butterfly" },
  { title: "bypass" },
  { title: "cat" },
  { title: "celtic" },
  { title: "chain" },
  { title: "channel-set" },
  { title: "claddagh" },
  { title: "clover" },
  { title: "cluster" },
  { title: "cocktail" },
  { title: "coffee-plated" },
  { title: "compass" },
  { title: "cross" },
  { title: "crown" },
  { title: "crystal" },
  { title: "cubic-zirconia" },
  { title: "cufflinks" },
  { title: "dangle" },
  { title: "display" },
  { title: "dome" },
  { title: "dragon" },
  { title: "drop" },
  { title: "eagle" },
  { title: "earrings" },
  { title: "elephant" },
  { title: "enamel" },
  { title: "engagement" },
  { title: "eternity" },
  { title: "evil-eye" },
  { title: "feather" },
  { title: "filigree" },
  { title: "fleur de lis" },
  { title: "flower" },
  { title: "geometric" },
  { title: "gold-plated" },
  { title: "gothic" },
  { title: "halo" },
  { title: "hamsa" },
  { title: "heart" },
  { title: "hoop" },
  { title: "horseshoe" },
  { title: "infinity" },
  { title: "key" },
  { title: "kit" },
  { title: "knots & bows" },
  { title: "leaf" },
  { title: "masonic" },
  { title: "mens" },
  { title: "military" },
  { title: "minimalist" },
  { title: "music" },
  { title: "nature" },
  { title: "nautical" },
  { title: "necklace" },
  { title: "number" },
  { title: "onyx" },
  { title: "opal" },
  { title: "owl" },
  { title: "panther" },
  { title: "pave" },
  { title: "peacock" },
  { title: "pearl" },
  { title: "pendant" },
  { title: "rhodium-plated" },
  { title: "ring" },
  { title: "rose" },
  { title: "rose-gold" },
  { title: "shield" },
  { title: "signet" },
  { title: "skull" },
  { title: "snake" },
  { title: "snowflake" },
  { title: "solitaire" },
  { title: "stackable" },
  { title: "stainless-steel" },
  { title: "starfish" },
  { title: "stars & moons" },
  { title: "sterling-silver" },
  { title: "stud" },
  { title: "synthetic-stone" },
  { title: "three-stone" },
  { title: "tiger" },
  { title: "tribal" },
  { title: "turquoise" },
  { title: "twisted" },
  { title: "vintage" },
  { title: "wedding" },
  { title: "wholesale" },
  { title: "wishbone" },
  { title: "zodiac" },
]

const tagInputs: ProductTag[] = TAGS.map((tag) => ({
  value: tag.title,
}))

export default async function createTags({ container }: ExecArgs) {
  const productModuleService = container.resolve(Modules.PRODUCT)

  const existing = await productModuleService.listProductTags(
    {},
    { select: ["id", "value"], take: 10000 }
  )
  const existingValues = new Set(existing.map((tag: ProductTag) => tag.value))
  const toCreate = tagInputs.filter((tag) => !existingValues.has(tag.value))

  const created = toCreate.length
    ? await productModuleService.createProductTags(toCreate)
    : []

  console.log(`Import tags: ${tagInputs.length}`)
  console.log(`Existing product tags: ${tagInputs.length - toCreate.length}`)
  console.log(`Created product tags: ${created.length}`)

  if (created.length) {
    console.log("\nCreated tags:")
    created.forEach((tag: ProductTag) => {
      console.log(`- ${tag.value} | id: ${tag.id}`)
    })
  }

  const allTags = await productModuleService.listProductTags(
    {},
    { select: ["id", "value"], take: 10000 }
  )
  const importTagValues = new Set(tagInputs.map((tag) => tag.value))
  const importTags = allTags
    .filter((tag: ProductTag) => importTagValues.has(tag.value))
    .sort((a: ProductTag, b: ProductTag) => a.value.localeCompare(b.value))

  console.log("\nAll import tags:")
  console.log(JSON.stringify(importTags, null, 2))

  console.log("\nTAG_ID_MAP = {")
  importTags.forEach((tag: ProductTag) => {
    console.log(`  "${tag.value}": "${tag.id}",`)
  })
  console.log("}")
}
