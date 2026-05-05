import { defineMiddlewares } from "@medusajs/framework/http"
import { z } from "@medusajs/deps/zod"

const productCustomFieldsValidator = {
  stone_type: z.array(z.string()).nullable().optional(),
  finish_plating: z.array(z.string()).nullable().optional(),
  ring_style: z.array(z.string()).nullable().optional(),
  earring_style: z.array(z.string()).nullable().optional(),
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/products",
      methods: ["POST"],
      additionalDataValidator: productCustomFieldsValidator,
    },
    {
      matcher: "/admin/products/:id",
      methods: ["POST"],
      additionalDataValidator: productCustomFieldsValidator,
    },
  ],
})
