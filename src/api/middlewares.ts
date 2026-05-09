import {
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/deps/zod"

const productCustomFieldsValidator = {
  stone_type: z.array(z.string()).nullable().optional(),
  finish_plating: z.array(z.string()).nullable().optional(),
  ring_style: z.array(z.string()).nullable().optional(),
  earring_style: z.array(z.string()).nullable().optional(),
}

const DEBUG_STORE_PRODUCTS =
  process.env.DEBUG_STORE_PRODUCTS === "true" ||
  process.env.DEBUG_STORE_PRODUCTS === "1"

const SUPPORTED_PRODUCT_MATERIALS = new Set([
  "Brass",
  "Iron",
  "Other",
  "Stainless Steel",
  "Sterling Silver",
  "White Metal",
])

function getDurationMs(start: bigint) {
  return Number(process.hrtime.bigint() - start) / 1_000_000
}

function formatMs(ms: number) {
  return `${ms.toFixed(1)}ms`
}

function shouldDebugStoreProducts(req: MedusaRequest) {
  return (
    DEBUG_STORE_PRODUCTS ||
    req.get("x-debug-store-products") === "true"
  )
}

function getMaterialQueryValues(value: unknown) {
  const values = Array.isArray(value) ? value : [value]

  return values
    .flatMap((item) => (typeof item === "string" ? item.split(",") : []))
    .map((item) => item.trim())
    .filter(Boolean)
}

function allowStoreProductsMaterialFilter(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  if (
    req.method !== "GET" ||
    req.originalUrl.split("?")[0] !== "/store/products" ||
    !("material" in req.query)
  ) {
    return next()
  }

  const materials = getMaterialQueryValues(req.query.material)
  const invalidMaterials = materials.filter(
    (material) => !SUPPORTED_PRODUCT_MATERIALS.has(material)
  )

  if (invalidMaterials.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid material filter value: ${invalidMaterials.join(", ")}`
    )
  }

  delete req.query.material

  if (!materials.length) {
    return next()
  }

  let filterableFields: Record<string, unknown> | undefined

  Object.defineProperty(req, "filterableFields", {
    configurable: true,
    get() {
      return filterableFields
    },
    set(value: Record<string, unknown>) {
      filterableFields = {
        ...value,
        material: materials,
      }
    },
  })

  return next()
}

function debugStoreProductsRequest(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  if (!shouldDebugStoreProducts(req)) {
    return next()
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const startedAt = process.hrtime.bigint()
  const queryTimings: string[] = []
  let lastQueryFinishedAt: bigint | null = null
  let jsonCalledAt: bigint | null = null
  let productCount: number | undefined
  let variantCount: number | undefined

  const originalResolve = req.scope.resolve.bind(req.scope)

  req.scope.resolve = ((name: string, ...args: unknown[]) => {
    const resolved = originalResolve(name, ...args)

    if (name !== ContainerRegistrationKeys.QUERY || !resolved) {
      return resolved
    }

    return new Proxy(resolved, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver)

        if (property !== "graph" && property !== "index") {
          return value
        }

        return async (...queryArgs: unknown[]) => {
          const queryStartedAt = process.hrtime.bigint()
          const query = queryArgs[0] as {
            entity?: string
            fields?: string[]
            filters?: unknown
            pagination?: { skip?: number; take?: number }
          }

          try {
            return await value.apply(target, queryArgs)
          } finally {
            const duration = getDurationMs(queryStartedAt)
            lastQueryFinishedAt = process.hrtime.bigint()
            queryTimings.push(
              [
                `${String(property)}:${query?.entity ?? "unknown"}`,
                formatMs(duration),
                `fields=${query?.fields?.length ?? 0}`,
                `take=${query?.pagination?.take ?? "n/a"}`,
                `skip=${query?.pagination?.skip ?? "n/a"}`,
              ].join(" ")
            )
          }
        }
      },
    })
  }) as typeof req.scope.resolve

  const originalJson = res.json.bind(res)

  res.json = ((body: unknown) => {
    jsonCalledAt = process.hrtime.bigint()
    const products = (body as { products?: unknown[] })?.products
    productCount = Array.isArray(products) ? products.length : undefined
    variantCount = Array.isArray(products)
      ? products.reduce<number>((count, product) => {
          const variants = (product as { variants?: unknown[] })?.variants

          return count + (Array.isArray(variants) ? variants.length : 0)
        }, 0)
      : undefined

    return originalJson(body)
  }) as typeof res.json

  res.on("finish", () => {
    const totalMs = getDurationMs(startedAt)
    const postQueryToJsonMs =
      lastQueryFinishedAt && jsonCalledAt
        ? Number(jsonCalledAt - lastQueryFinishedAt) / 1_000_000
        : undefined
    const jsonToFinishMs = jsonCalledAt ? getDurationMs(jsonCalledAt) : undefined

    logger.info(
      [
        "[store-products-debug]",
        `${req.method} ${req.originalUrl}`,
        `status=${res.statusCode}`,
        `total=${formatMs(totalMs)}`,
        postQueryToJsonMs === undefined
          ? undefined
          : `after_query_to_json=${formatMs(postQueryToJsonMs)}`,
        jsonToFinishMs === undefined
          ? undefined
          : `json_to_finish=${formatMs(jsonToFinishMs)}`,
        `products=${productCount ?? "n/a"}`,
        `variants=${variantCount ?? "n/a"}`,
        queryTimings.length ? `queries=[${queryTimings.join("; ")}]` : undefined,
      ]
        .filter(Boolean)
        .join(" ")
    )
  })

  return next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/products",
      middlewares: [allowStoreProductsMaterialFilter],
    },
    {
      matcher: "/store/products",
      methods: ["GET"],
      middlewares: [debugStoreProductsRequest],
    },
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
