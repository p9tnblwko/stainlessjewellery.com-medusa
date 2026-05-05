import { model } from "@medusajs/framework/utils"

const ProductCustomField = model.define("product_custom_field", {
  id: model.id().primaryKey(),
  product_id: model.text().unique().index("IDX_product_custom_field_product_id"),
  stone_type: model.array().nullable(),
  finish_plating: model
    .array()
    .nullable(),
  ring_style: model.array().nullable(),
  earring_style: model
    .array()
    .nullable(),
})

export default ProductCustomField
