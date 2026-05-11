# StainlessJewellery.com Medusa App Spec

## Overview

StainlessJewellery.com Medusa is the commerce backend for a jewelry storefront. It manages product catalog data, jewelry-specific filter attributes, checkout/payment sessions, admin product enrichment, migration utilities, and storefront-facing product APIs.

The app is built on Medusa v2 and is intended to serve a separate storefront, likely the sibling `stainlessjewellery.com-next` application.

## Product Goals

- Provide a reliable ecommerce backend for stainless steel and fashion jewelry.
- Support rich catalog browsing by category, collection, material, stone type, finish/plating, plating, ring style, and earring style.
- Give admins a simple way to maintain jewelry-specific filter metadata on products.
- Support PayPal checkout through a custom Medusa payment provider.
- Support migration from Shopify image URLs and imported CSV product data.
- Generate SEO sitemap data for the storefront.

## Users

### Store Customers

Customers browse jewelry products, filter by product attributes, view product detail pages, add items to cart, and complete checkout.

### Store Admins

Admins manage products in Medusa Admin, enrich jewelry metadata, maintain categories/tags/collections, and support catalog migration/cleanup.

### Developers / Operators

Developers run scripts for seeding, migration, sitemap generation, image downloads, and production maintenance.

## Current Capabilities

### Catalog Management

The backend uses Medusa's product module for standard ecommerce catalog data:

- Products
- Variants
- Prices
- Product images
- Thumbnails
- Categories
- Collections
- Product tags
- Product material
- Product status

Seed scripts define jewelry categories and tags for the catalog.

Primary categories include:

- Rings
- Earrings
- Necklaces
- Bracelets
- Brooches
- Collections
- Occasions

Example subcategories include solitaire rings, halo rings, stud earrings, pendant necklaces, tennis bracelets, birthstone, vintage, biker, wedding and bridal, and minimalist.

### Jewelry Custom Fields

The app adds a custom Medusa module named `product-custom-field`.

Each product can have one custom field record keyed by `product_id`.

Supported custom fields:

- `stone_type`
- `finish_plating`
- `ring_style`
- `earring_style`
- `plating`

Each field stores an optional array of strings. These fields are designed for storefront filtering and merchandising.

### Admin Product Metadata Widget

The Medusa Admin product detail page includes a custom widget after product details.

The widget allows admins to edit:

- Stone type
- Finish plating
- Ring style
- Earring style
- Plating

Input format is comma-separated text. The backend normalizes values into string arrays and removes empty values.

### Product Custom Field APIs

Admin endpoints:

- `GET /admin/products/:id/custom-fields`
- `POST /admin/products/:id/custom-fields`
- `GET /admin/products/custom-fields`

Storefront endpoint:

- `GET /store/products/custom-fields`

The storefront custom-fields endpoint returns published products matching one or more custom field filters.

Supported query filters:

- `stone_type`
- `finish_plating`
- `ring_style`
- `earring_style`
- `plating`
- `limit`
- `offset`
- `fields`

Filtering behavior uses overlap matching, so a product matches when at least one requested value appears in the stored field array.

### Product Material Filtering

The app extends `GET /store/products` with custom `material` and `plating` query filters.

Supported material values:

- Brass
- Iron
- Other
- Stainless Steel
- Sterling Silver
- White Metal

Invalid material values return an invalid data error.

The material filter can be combined with standard Medusa filters such as category filters.

Supported plating values:

- Antique
- Black
- Gold
- No Plating
- Rhodium
- Rose Gold
- Two Tone Black
- Two Tone Blue
- Two Tone Gold

The plating filter matches products through their custom field record and can be combined with standard Medusa product filters.

### Payment

The app includes a custom PayPal payment provider module.

Capabilities:

- Initiate PayPal orders
- Authorize PayPal payments
- Capture authorized payments
- Refund captured payments
- Update payment amount
- Void/cancel authorizations
- Retrieve PayPal order status
- Map PayPal order states into Medusa payment session statuses
- Verify PayPal webhook signatures when a webhook ID is configured

Environment support:

- Sandbox by default
- Production when configured through environment variables

### File Storage

The app configures Medusa's local file provider. Static asset URLs are configured through environment variables.

Migration scripts support rewriting Shopify image URLs to local/static Medusa image URLs.

### Migration And Maintenance Scripts

The repo includes operational scripts for:

- Seeding default Medusa data
- Seeding jewelry categories
- Seeding product tags
- Seeding collections
- Printing collection ID maps
- Syncing custom product fields from variant metadata
- Syncing product materials from descriptions
- Syncing canonical product plating values from product descriptions
- Downloading missing images from CSV sources into `~/medusa-images`
- Rewriting Shopify image URLs for dev and prod static URLs
- Generating a storefront sitemap

### SEO

The sitemap generation script writes a sitemap for the storefront using:

- Static routes
- Published product handles
- Product categories
- Product collections

Default static routes include:

- `/`
- `/collection`
- `/about`
- `/care`
- `/contact`
- `/faq`
- `/returns`
- `/shipping`
- `/size-guide`

## Data Model

### Product Custom Field

Entity: `product_custom_field`

Fields:

- `id`: primary key
- `product_id`: unique indexed product ID
- `stone_type`: nullable string array
- `finish_plating`: nullable string array
- `ring_style`: nullable string array
- `earring_style`: nullable string array
- `plating`: nullable string array

Business rules:

- One custom field record per product.
- Empty arrays are stored as `null`.
- Product delete workflow removes associated custom field records.
- Product create/update workflows can upsert custom fields from Medusa `additional_data`.

## Main User Flows

### Admin Enriches A Product

1. Admin opens a product in Medusa Admin.
2. Admin finds the Custom fields widget.
3. Admin enters comma-separated values for relevant jewelry attributes.
4. Admin saves.
5. Backend creates or updates the product's custom field record.
6. Storefront can use these fields for filtering and product listing pages.

### Customer Filters Products By Jewelry Attributes

1. Customer chooses one or more filters in the storefront.
2. Storefront calls `GET /store/products` with `plating[]` or calls `GET /store/products/custom-fields` with custom field query values.
3. Backend finds matching custom field records.
4. Backend loads published products for the matching product IDs.
5. Response includes products and their custom fields.

### Customer Filters Products By Material

1. Customer selects a material filter.
2. Storefront calls `GET /store/products?material[]=Stainless%20Steel`.
3. Middleware validates material values.
4. Backend applies the material filter to the Medusa product request.
5. Response returns matching products.

### Customer Pays With PayPal

1. Storefront initiates checkout through Medusa.
2. PayPal provider creates a PayPal order.
3. Storefront redirects or presents the PayPal approval URL.
4. Customer approves payment.
5. Backend authorizes or captures the PayPal payment depending on configuration.
6. Medusa checkout continues with payment session status updates.

### Operator Migrates Shopify Images

1. Operator downloads missing images from CSV sources into `~/medusa-images`.
2. Operator rewrites Shopify image URLs to static Medusa URLs.
3. Dev script targets `http://localhost:9000/static`.
4. Prod script targets `https://api.stainlessjewellery.com/static`.

### Operator Syncs Product Plating

1. Operator runs `npm run sync:product-plating`.
2. Script reads products from the Medusa database.
3. Script detects plating values from product descriptions.
4. Script maps source values into canonical storefront filters.
5. Script creates or updates product custom field records with `plating`.

Canonical plating values:

- No Plating
- Rhodium
- Gold
- Rose Gold
- Black
- Two Tone Gold
- Two Tone Black
- Two Tone Blue
- Antique

## Technical Architecture

### Platform

- Runtime: Node.js 20+
- Framework: Medusa v2
- Language: TypeScript
- Database: PostgreSQL
- Cache/message infrastructure: Redis
- Admin UI: Medusa Admin with custom React widget
- Payment provider: PayPal
- File provider: Medusa local file provider

### Local Development

Docker Compose services:

- `postgres`
- `redis`
- `medusa`

Exposed ports:

- Medusa API/Admin: `9000`
- Admin Vite HMR: `5173`
- PostgreSQL: `5432`
- Redis: `6379`

Primary commands:

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run seed`
- `npm run docker:up`
- `npm run docker:down`

## Environment Variables

Core:

- `DATABASE_URL`
- `REDIS_URL`
- `STORE_CORS`
- `ADMIN_CORS`
- `AUTH_CORS`
- `JWT_SECRET`
- `COOKIE_SECRET`
- `DISABLE_MEDUSA_ADMIN`

Files:

- `LOCAL_FILE_PROVIDER_BACKEND_URL`

PayPal:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENVIRONMENT`
- `PAYPAL_SANDBOX`
- `PAYPAL_AUTO_CAPTURE`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_AUTH_WEBHOOK_ID`

Scripts:

- `SITE_URL`
- `STORE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `SITEMAP_OUTPUT_PATH`
- `IMAGE_SOURCE_CSV`
- `STATIC_IMAGE_DIR`
- `STATIC_BASE_URL`
- `IMAGE_DOWNLOAD_CONCURRENCY`
- `DRY_RUN`

Debug:

- `DEBUG_STORE_PRODUCTS`

## API Requirements

### Admin Custom Fields Detail

`GET /admin/products/:id/custom-fields`

Returns:

- `custom_fields`: product custom field record or `null`

`POST /admin/products/:id/custom-fields`

Request body:

```json
{
  "stone_type": ["diamond", "pearl"],
  "finish_plating": ["gold"],
  "ring_style": ["stackable"],
  "earring_style": null,
  "plating": ["Gold"]
}
```

Returns:

- `custom_fields`: created or updated product custom field record

### Admin Custom Fields Search

`GET /admin/products/custom-fields`

Query params:

- `stone_type`
- `finish_plating`
- `ring_style`
- `earring_style`
- `plating`
- `limit`
- `offset`
- `fields`

Returns:

- `products`
- `count`
- `limit`
- `offset`

### Store Custom Fields Search

`GET /store/products/custom-fields`

Same filters as admin search, but only returns published products.

Returns:

- `products`
- `count`
- `limit`
- `offset`

### Store Products Material Filter

`GET /store/products?material[]=Brass`

Can be combined with standard product filters.

Returns the standard Medusa store products response.

### Store Products Plating Filter

`GET /store/products?plating[]=Gold`

Can be combined with standard product filters.

Returns the standard Medusa store products response.

## Testing

Current integration coverage includes:

- Health checks
- Store products material filter
- Combining category and material filters
- Rejecting unsupported material values

Recommended additional tests:

- Admin custom fields create/update/get
- Store custom fields filtering
- Store custom fields filtering by plating
- Workflow hook upsert on product create/update
- Workflow hook cleanup on product delete
- PayPal provider status mapping with mocked PayPal responses
- Image URL rewrite dry-run behavior

## MVP Completion Criteria

The current backend supports the core MVP when:

- Products, variants, prices, images, categories, collections, and tags are seeded/imported.
- Product custom fields are populated for filterable jewelry attributes.
- Storefront can browse products by category, collection, tag, material, plating, and custom fields.
- PayPal checkout works in sandbox and production configurations.
- Image URLs resolve from the configured static host.
- Sitemap is generated into the storefront public directory.

## Known Gaps And Risks

- PayPal provider contains console logging of provider initialization and options; this should be removed before production because it may expose sensitive configuration.
- Custom field filters currently live in a separate `/store/products/custom-fields` endpoint instead of the main `/store/products` endpoint.
- Custom field values are free-form text arrays, so inconsistent spelling or casing can fragment filters.
- The `plating` description sync normalizes known source values, but new unmapped source values must be added to the script mapping.
- Local file storage is simple but may need S3 or another production file provider if image volume or deployment topology requires it.
- Several migration scripts are operational utilities and should be run carefully with dry-run options where available.
- The default README is still the Medusa starter README and does not document this project's custom behavior.

## Suggested Roadmap

### Phase 1: Stabilize Catalog Operations

- Document all custom scripts in the project README.
- Add controlled value lists for custom fields.
- Add integration tests for custom fields APIs and workflow hooks.
- Remove sensitive PayPal console logs.

### Phase 2: Improve Storefront Filtering

- Decide whether custom field filters should be merged into `GET /store/products`.
- Normalize custom field values through canonical slugs.
- Return available filter facets for the current category/search context.

### Phase 3: Production Hardening

- Move from local file provider to production-grade object storage if needed.
- Add webhook tests for PayPal.
- Add deployment documentation.
- Add backup/restore notes for product and custom field data.
