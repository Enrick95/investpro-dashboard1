export type Plan = "free" | "pro" | "premium";

const KEY_PLAN = "investpro_plan_v1";

export function getPlan(): Plan {
  if (typeof window === "undefined") return "free";
  const v = localStorage.getItem(KEY_PLAN);
  if (v === "pro" || v === "premium") return v;
  return "free";
}

export function setPlan(plan: Plan) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_PLAN, plan);
}

export function hasTradingTerminalAccess() {
  const p = getPlan();
  return p === "pro" || p === "premium";
}
