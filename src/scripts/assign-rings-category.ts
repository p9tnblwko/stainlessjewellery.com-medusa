import type { ExecArgs } from "@medusajs/framework/types"
import {
  assignProductsFromCategoryToCategory,
  type SubcategoryRule,
} from "./utils/assign-category"

const RINGS_NAME = "Rings"
const RINGS_HANDLE = "rings"
const BRACELETS_NAME = "Bracelets"
const BRACELETS_HANDLE = "bracelets"
const RING_NAME_PATTERN =
  /\b(?:ring|rings|bridal\s+set|bridal\s+sets|signet|band|bands|solitaire|halo|stackable|bypass|cluster|cocktail|eternity)\b/i

const RING_SUBCATEGORY_RULES: SubcategoryRule[] = [
  {
    name: "Solitaire Rings",
    handle: "solitaire",
    pattern: /\b(?:solitaire)\b/i,
  },
  {
    name: "Halo Rings",
    handle: "halo",
    pattern: /\b(?:halo)\b/i,
  },
  {
    name: "Cocktail Rings",
    handle: "cocktail",
    pattern: /\b(?:cocktail)\b/i,
  },
  {
    name: "Signet Rings",
    handle: "signet",
    pattern: /\b(?:signet)\b/i,
  },
  {
    name: "Band Rings",
    handle: "band",
    pattern: /\b(?:band|bands)\b/i,
  },
  {
    name: "Eternity Rings",
    handle: "eternity",
    pattern: /\b(?:eternity)\b/i,
  },
  {
    name: "Bridal Sets",
    handle: "bridal",
    pattern: /\b(?:bridal|wedding|engagement)\b/i,
  },
  {
    name: "Stackable Rings",
    handle: "stackable",
    pattern: /\b(?:stackable|stacking|stack)\b/i,
  },
  {
    name: "Bypass Rings",
    handle: "bypass",
    pattern: /\b(?:bypass)\b/i,
  },
  {
    name: "Cluster Rings",
    handle: "cluster",
    pattern: /\b(?:cluster)\b/i,
  },
]

export default async function assignRingsCategory({
  container,
  args,
}: ExecArgs) {
  await assignProductsFromCategoryToCategory({
    args,
    container,
    sourceName: BRACELETS_NAME,
    sourceHandle: BRACELETS_HANDLE,
    targetName: RINGS_NAME,
    targetHandle: RINGS_HANDLE,
    matchLabel: "ring",
    namePattern: RING_NAME_PATTERN,
    source: "assign-rings-category-script",
    subcategoryRules: RING_SUBCATEGORY_RULES,
  })
}
