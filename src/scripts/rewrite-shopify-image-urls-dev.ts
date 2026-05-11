import type { ExecArgs } from "@medusajs/framework/types"
import { rewriteShopifyImageUrls } from "./rewrite-shopify-image-urls"

export default async function rewriteShopifyImageUrlsDev(args: ExecArgs) {
  return rewriteShopifyImageUrls(args, "dev")
}
