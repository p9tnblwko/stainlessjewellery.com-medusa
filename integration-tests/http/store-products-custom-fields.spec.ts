import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ProductStatus } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"

import { PRODUCT_CUSTOM_FIELD_MODULE } from "../../src/modules/product-custom-field"

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("GET /store/products plating filter", () => {
      beforeEach(async () => {
        const container = getContainer()
        const customFieldService = container.resolve(
          PRODUCT_CUSTOM_FIELD_MODULE
        ) as any

        const { result: shippingProfiles } =
          await createShippingProfilesWorkflow(container).run({
            input: {
              data: [
                {
                  name: "Default Shipping Profile",
                  type: "default",
                },
              ],
            },
          })

        const { result: products } = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: "Gold Ring",
                handle: "gold-ring",
                status: ProductStatus.PUBLISHED,
                shipping_profile_id: shippingProfiles[0].id,
                options: [{ title: "Size", values: ["One Size"] }],
                variants: [
                  {
                    title: "One Size",
                    sku: "gold-ring-one-size",
                    options: { Size: "One Size" },
                    prices: [{ amount: 1000, currency_code: "usd" }],
                  },
                ],
              },
              {
                title: "Rhodium Ring",
                handle: "rhodium-ring",
                status: ProductStatus.PUBLISHED,
                shipping_profile_id: shippingProfiles[0].id,
                options: [{ title: "Size", values: ["One Size"] }],
                variants: [
                  {
                    title: "One Size",
                    sku: "rhodium-ring-one-size",
                    options: { Size: "One Size" },
                    prices: [{ amount: 1200, currency_code: "usd" }],
                  },
                ],
              },
              {
                title: "Draft Gold Ring",
                handle: "draft-gold-ring",
                status: ProductStatus.DRAFT,
                shipping_profile_id: shippingProfiles[0].id,
                options: [{ title: "Size", values: ["One Size"] }],
                variants: [
                  {
                    title: "One Size",
                    sku: "draft-gold-ring-one-size",
                    options: { Size: "One Size" },
                    prices: [{ amount: 1400, currency_code: "usd" }],
                  },
                ],
              },
            ],
          },
        })

        await customFieldService.createProductCustomFields([
          {
            product_id: products.find((product) => product.handle === "gold-ring")!
              .id,
            plating: ["Gold"],
          },
          {
            product_id: products.find(
              (product) => product.handle === "rhodium-ring"
            )!.id,
            plating: ["Rhodium"],
          },
          {
            product_id: products.find(
              (product) => product.handle === "draft-gold-ring"
            )!.id,
            plating: ["Gold"],
          },
        ])
      })

      it("filters published products by plating", async () => {
        const response = await api.get("/store/products?plating[]=Gold")

        expect(response.status).toEqual(200)
        expect(response.data.count).toEqual(1)
        expect(response.data.products).toHaveLength(1)
        expect(response.data.products[0]).toEqual(
          expect.objectContaining({
            title: "Gold Ring",
          })
        )
      })

      it("rejects unsupported plating values", async () => {
        const response = await api
          .get("/store/products?plating[]=Chrome")
          .catch((error) => error.response)

        expect(response.status).toEqual(400)
        expect(response.data.message).toContain(
          "Invalid plating filter value: Chrome"
        )
      })
    })
  },
})
