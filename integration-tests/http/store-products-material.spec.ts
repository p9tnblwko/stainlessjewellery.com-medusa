import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ProductStatus } from "@medusajs/framework/utils"
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("GET /store/products material filter", () => {
      let categoryId: string

      beforeEach(async () => {
        const container = getContainer()

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

        const { result: categories } = await createProductCategoriesWorkflow(
          container
        ).run({
          input: {
            product_categories: [
              {
                name: "Rings",
                is_active: true,
              },
              {
                name: "Necklaces",
                is_active: true,
              },
            ],
          },
        })

        categoryId = categories.find((category) => category.name === "Rings")!.id
        const otherCategoryId = categories.find(
          (category) => category.name === "Necklaces"
        )!.id

        await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: "Brass Ring",
                handle: "brass-ring",
                status: ProductStatus.PUBLISHED,
                material: "Brass",
                shipping_profile_id: shippingProfiles[0].id,
                category_ids: [categoryId],
                options: [{ title: "Size", values: ["One Size"] }],
                variants: [
                  {
                    title: "One Size",
                    sku: "brass-ring-one-size",
                    options: { Size: "One Size" },
                    prices: [{ amount: 1000, currency_code: "usd" }],
                  },
                ],
              },
              {
                title: "White Metal Ring",
                handle: "white-metal-ring",
                status: ProductStatus.PUBLISHED,
                material: "White Metal",
                shipping_profile_id: shippingProfiles[0].id,
                category_ids: [categoryId],
                options: [{ title: "Size", values: ["One Size"] }],
                variants: [
                  {
                    title: "One Size",
                    sku: "white-metal-ring-one-size",
                    options: { Size: "One Size" },
                    prices: [{ amount: 1200, currency_code: "usd" }],
                  },
                ],
              },
              {
                title: "White Metal Necklace",
                handle: "white-metal-necklace",
                status: ProductStatus.PUBLISHED,
                material: "White Metal",
                shipping_profile_id: shippingProfiles[0].id,
                category_ids: [otherCategoryId],
                options: [{ title: "Size", values: ["One Size"] }],
                variants: [
                  {
                    title: "One Size",
                    sku: "white-metal-necklace-one-size",
                    options: { Size: "One Size" },
                    prices: [{ amount: 1400, currency_code: "usd" }],
                  },
                ],
              },
              {
                title: "Iron Ring",
                handle: "iron-ring",
                status: ProductStatus.PUBLISHED,
                material: "Iron",
                shipping_profile_id: shippingProfiles[0].id,
                category_ids: [categoryId],
                options: [{ title: "Size", values: ["One Size"] }],
                variants: [
                  {
                    title: "One Size",
                    sku: "iron-ring-one-size",
                    options: { Size: "One Size" },
                    prices: [{ amount: 900, currency_code: "usd" }],
                  },
                ],
              },
            ],
          },
        })
      })

      it("filters products by one material value", async () => {
        const response = await api.get("/store/products?material[]=Brass")

        expect(response.status).toEqual(200)
        expect(response.data.count).toEqual(1)
        expect(response.data.products).toHaveLength(1)
        expect(response.data.products[0]).toEqual(
          expect.objectContaining({
            title: "Brass Ring",
            material: "Brass",
          })
        )
      })

      it("filters products by multiple material values", async () => {
        const response = await api.get(
          "/store/products?material[]=Brass&material[]=Iron"
        )

        expect(response.status).toEqual(200)
        expect(response.data.count).toEqual(2)
        expect(response.data.products.map((product) => product.material).sort())
          .toEqual(["Brass", "Iron"])
      })

      it("combines category and material filters", async () => {
        const response = await api.get(
          `/store/products?category_id[]=${categoryId}&material[]=White%20Metal`
        )

        expect(response.status).toEqual(200)
        expect(response.data.count).toEqual(1)
        expect(response.data.products).toHaveLength(1)
        expect(response.data.products[0]).toEqual(
          expect.objectContaining({
            title: "White Metal Ring",
            material: "White Metal",
          })
        )
      })
    })
  },
})
