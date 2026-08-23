export const PLAN_IDS = ["start", "team", "agency"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_INTERVALS = ["monthly", "annual"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export type PlanDefinition = {
  id: PlanId;
  monthlyUsdCents: number;
  profiles: number;
  seats: number;
};

export const PLANS: PlanDefinition[] = [
  { id: "start", monthlyUsdCents: 3900, profiles: 1, seats: 2 },
  { id: "team", monthlyUsdCents: 7900, profiles: 5, seats: 5 },
  { id: "agency", monthlyUsdCents: 14900, profiles: 15, seats: 10 },
];

export function isPlanId(value: string): value is PlanId {
  return PLAN_IDS.includes(value as PlanId);
}

export function isBillingInterval(value: string): value is BillingInterval {
  return BILLING_INTERVALS.includes(value as BillingInterval);
}

export function getPlan(planId: PlanId): PlanDefinition {
  const plan = PLANS.find((item) => item.id === planId);
  if (!plan) {
    throw new Error(`Unknown plan ${planId}`);
  }
  return plan;
}

/** Annual bills 10 months (two months included). */
export function planAmountCents(
  planId: PlanId,
  interval: BillingInterval,
): number {
  const plan = getPlan(planId);
  if (interval === "annual") {
    return plan.monthlyUsdCents * 10;
  }
  return plan.monthlyUsdCents;
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
