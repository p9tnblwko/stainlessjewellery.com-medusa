import { MedusaService } from "@medusajs/framework/utils"

import ProductCustomField from "./models/product-custom-field"

class ProductCustomFieldModuleService extends MedusaService({
  ProductCustomField,
}) {}

export default ProductCustomFieldModuleService
