import type { ExecArgs } from "@medusajs/framework/types"
import {
  assignRingProductsToCategory,
  type SubcategoryRule,
} from "./utils/assign-category"

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

export default async function assignEarringsCategory({
  container,
  args,
}: ExecArgs) {
  await assignRingProductsToCategory({
    args,
    container,
    targetName: EARRINGS_NAME,
    targetHandle: EARRINGS_HANDLE,
    matchLabel: "earring",
    namePattern: EARRING_NAME_PATTERN,
    source: "assign-earrings-category-script",
    subcategoryRules: EARRING_SUBCATEGORY_RULES,
  })
}
