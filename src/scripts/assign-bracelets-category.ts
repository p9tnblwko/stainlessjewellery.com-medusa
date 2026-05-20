import type { ExecArgs } from "@medusajs/framework/types"
import {
  assignRingProductsToCategory,
  type SubcategoryRule,
} from "./utils/assign-category"

const BRACELETS_NAME = "Bracelets"
const BRACELETS_HANDLE = "bracelets"
const BRACELET_NAME_PATTERN =
  /\b(?:bracelet|bracelets|bangle|bangles|cuff|cuffs|wristlet|wristlets)\b/i

const BRACELET_SUBCATEGORY_RULES: SubcategoryRule[] = [
  {
    name: "Tennis Bracelets",
    handle: "tennis",
    pattern: /\b(?:tennis)\b/i,
  },
  {
    name: "Bangles & Cuffs",
    handle: "bangles-cuffs",
    pattern: /\b(?:bangle|bangles|cuff|cuffs|wrap|wraps)\b/i,
  },
  {
    name: "Chain Bracelets",
    handle: "chain",
    pattern: /\b(?:chain|chains|link|links|bead|beads|bolo|slider)\b/i,
  },
]

export default async function assignBraceletsCategory({
  container,
  args,
}: ExecArgs) {
  await assignRingProductsToCategory({
    args,
    container,
    targetName: BRACELETS_NAME,
    targetHandle: BRACELETS_HANDLE,
    matchLabel: "bracelet",
    namePattern: BRACELET_NAME_PATTERN,
    source: "assign-bracelets-category-script",
    subcategoryRules: BRACELET_SUBCATEGORY_RULES,
  })
}
