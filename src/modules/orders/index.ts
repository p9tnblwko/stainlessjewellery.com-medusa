import { Module } from "@medusajs/framework/utils"
import OrdersModuleService from "./service"

export const ORDERS_MODULE = "ordersCustom"

export default Module(ORDERS_MODULE, {
  service: OrdersModuleService,
})
