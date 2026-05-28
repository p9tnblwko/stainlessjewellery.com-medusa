import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type PoliciesAcceptedRecord = {
  accepted: boolean
  accepted_at: string
  policy_versions?: Record<string, string>
  ip_address?: string | null
  user_agent?: string | null
  billing_country?: string | null
}

type OrderRecord = {
  id: string
  metadata?: Record<string, unknown> | null
}

function normalizePoliciesAccepted(
  metadata: Record<string, unknown> | null | undefined
): PoliciesAcceptedRecord | null {
  const value = metadata?.policies_accepted

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const acceptedAt = typeof record.accepted_at === "string" ? record.accepted_at : null

  if (record.accepted !== true || !acceptedAt) {
    return null
  }

  const policyVersions =
    record.policy_versions &&
    typeof record.policy_versions === "object" &&
    !Array.isArray(record.policy_versions)
      ? Object.fromEntries(
          Object.entries(record.policy_versions).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )
      : undefined

  return {
    accepted: true,
    accepted_at: acceptedAt,
    policy_versions: policyVersions,
    ip_address: typeof record.ip_address === "string" ? record.ip_address : null,
    user_agent: typeof record.user_agent === "string" ? record.user_agent : null,
    billing_country:
      typeof record.billing_country === "string" ? record.billing_country : null,
  }
}

export default async function orderPlacedPoliciesAcceptedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderModuleService = container.resolve(Modules.ORDER) as {
    retrieveOrder: (id: string, config?: Record<string, unknown>) => Promise<OrderRecord>
  }
  const order = await orderModuleService.retrieveOrder(data.id, {
    select: ["id", "metadata"],
  })
  const policiesAccepted = normalizePoliciesAccepted(order.metadata)

  if (!policiesAccepted) {
    return
  }

  const pgConnection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  await pgConnection("order")
    .where({ id: order.id })
    .update({ policies_accepted: JSON.stringify(policiesAccepted) })
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: {
    subscriberId: "order-placed-policies-accepted",
  },
}
