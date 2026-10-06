export type InvestProPlan = "FREE" | "PRO" | "VIP";

export type FeatureKey =
  | "dashboard"
  | "journal"
  | "plan"
  | "simulator"
  | "reports"
  | "monthly_report"
  | "connections"
  | "leaderboard"
  | "challenges"
  | "priority_support"
  | "vip_channel";

export const PLAN_ORDER: Record<InvestProPlan, number> = {
  FREE: 0,
  PRO: 1,
  VIP: 2,
};

export const PLAN_FEATURES: Record<InvestProPlan, FeatureKey[]> = {
  FREE: [
    "dashboard",
    "journal",
    "plan",
    "simulator",
  ],
  PRO: [
    "dashboard",
    "journal",
    "plan",
    "simulator",
    "reports",
    "monthly_report",
    "connections",
    "leaderboard",
    "challenges",
  ],
  VIP: [
    "dashboard",
    "journal",
    "plan",
    "simulator",
    "reports",
    "monthly_report",
    "connections",
    "leaderboard",
    "challenges",
    "priority_support",
    "vip_channel",
  ],
};

export function normalizePlan(value?: string | null): InvestProPlan {
  const plan = String(value || "").trim().toUpperCase();

  if (plan === "VIP") return "VIP";
  if (plan === "PRO") return "PRO";
  return "FREE";
}

export function hasFeature(
  planValue: string | null | undefined,
  feature: FeatureKey
) {
  const plan = normalizePlan(planValue);
  return PLAN_FEATURES[plan].includes(feature);
}

export function hasAtLeastPlan(
  planValue: string | null | undefined,
  minimum: InvestProPlan
) {
  const plan = normalizePlan(planValue);
  return PLAN_ORDER[plan] >= PLAN_ORDER[minimum];
}
