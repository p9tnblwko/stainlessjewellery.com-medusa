import type { ExecArgs } from "@medusajs/framework/types"
import { rewriteShopifyImageUrls } from "./rewrite-shopify-image-urls"

export default async function rewriteShopifyImageUrlsProd(args: ExecArgs) {
  return rewriteShopifyImageUrls(args, "prod")
}
