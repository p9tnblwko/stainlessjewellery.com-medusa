import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const paypalEnvironment =
  process.env.PAYPAL_ENVIRONMENT ||
  (process.env.PAYPAL_SANDBOX === 'true' ? 'sandbox' : undefined) ||
  'sandbox'

const paypalWebhookId =
  process.env.PAYPAL_WEBHOOK_ID || process.env.PAYPAL_AUTH_WEBHOOK_ID

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: {
      ssl: false,
      sslmode: "disable",
    },
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    cookieOptions: {
      sameSite: "lax",
      secure: false,
    },
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    vite: (config) => {
      return {
        server: {
          host: "0.0.0.0",
          // Allow all hosts when running in Docker (development mode)
          // In production, this should be more restrictive
          allowedHosts: [
            "localhost",
            ".localhost",
            "127.0.0.1",
          ],
          hmr: {
            // HMR websocket port inside container
            port: 5173,
            // Port browser connects to (exposed in docker-compose.yml)
            clientPort: 5173,
          },
        },
      }
    },
  },
  modules: [
    {
      resolve: "./src/modules/product-custom-field",
    },
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              backend_url: process.env.LOCAL_FILE_PROVIDER_BACKEND_URL,
            },
          },
        ],
      },
    },
    {
      resolve: '@medusajs/medusa/payment',
      options: {
        providers: [
          {
            resolve: './src/modules/paypal',
            id: 'paypal',
            options: {
              client_id: process.env.PAYPAL_CLIENT_ID!,
              client_secret: process.env.PAYPAL_CLIENT_SECRET!,
              environment: paypalEnvironment,
              autoCapture: process.env.PAYPAL_AUTO_CAPTURE === 'true',
              webhook_id: paypalWebhookId,
            },
          },
        ],
      },
    },
  ],
})
