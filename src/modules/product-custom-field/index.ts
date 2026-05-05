import { Module } from "@medusajs/framework/utils"

import ProductCustomFieldModuleService from "./service"

export const PRODUCT_CUSTOM_FIELD_MODULE = "productCustomField"

export default Module(PRODUCT_CUSTOM_FIELD_MODULE, {
  service: ProductCustomFieldModuleService,
})
