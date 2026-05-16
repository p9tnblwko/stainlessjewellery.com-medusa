import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

const ROBOTS_TXT = ["User-agent: *", "Disallow: /", ""].join("\n")

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.status(200).send(ROBOTS_TXT)
}

export async function HEAD(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.status(200).end()
}
