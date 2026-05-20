import type { ExecArgs } from "@medusajs/framework/types"
import {
  assignRingProductsToCategory,
  type SubcategoryRule,
} from "./utils/assign-category"

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

export default async function assignNecklacesCategory({
  container,
  args,
}: ExecArgs) {
  await assignRingProductsToCategory({
    args,
    container,
    targetName: NECKLACES_NAME,
    targetHandle: NECKLACES_HANDLE,
    matchLabel: "necklace",
    namePattern: NECKLACE_NAME_PATTERN,
    source: "assign-necklaces-category-script",
    subcategoryRules: NECKLACE_SUBCATEGORY_RULES,
  })
}
