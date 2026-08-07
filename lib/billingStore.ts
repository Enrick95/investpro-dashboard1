"use client";

/**
 * billingStore.ts (mock)
 * - Source temporaire pour afficher un dashboard "Stripe-like"
 * - Tu remplaceras `loadBillingRecords()` par des datas Stripe/API
 */

export type BillingStatus =
  | "paid"
  | "failed"
  | "refunded"
  | "disputed"
  | "unpaid"
  | "canceled";

export type BillingRecord = {
  id: string;
  createdAt: number; // ms
  currency: "USD" | "EUR";
  amount: number; // montant "brut" encaissé/attempt
  netAmount: number; // après fees / net estimé
  status: BillingStatus;

  customerId: string;
  customerName: string;
  customerEmail?: string;

  plan: "FREE" | "PRO" | "ELITE";
  interval: "month" | "year";
};

export type BillingRange = {
  from: number; // ms inclusive
  to: number; // ms inclusive
};

export function fmtMoney(n: number, currency: "USD" | "EUR" = "EUR") {
  const locale = "fr-FR";
  return n.toLocaleString(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

export function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function daysBetween(from: number, to: number) {
  const a = startOfDay(from);
  const b = startOfDay(to);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/* ----------------------- MOCK DATA ----------------------- */

function seededRand(seed: number) {
  let x = seed || 123456789;
  return () => {
    // xorshift
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    const t = (x >>> 0) / 4294967295;
    return t;
  };
}

function makeMockRecords(range: BillingRange): BillingRecord[] {
  const rnd = seededRand(Math.floor(range.from / 100000));
  const out: BillingRecord[] = [];

  const customers = [
    { id: "cus_1", name: "Imene Belhanafi", email: "imene@demo.com" },
    { id: "cus_2", name: "Client non identifié", email: "guest1@demo.com" },
    { id: "cus_3", name: "Client non identifié", email: "guest2@demo.com" },
    { id: "cus_4", name: "Client non identifié", email: "guest3@demo.com" },
    { id: "cus_5", name: "Theo L.", email: "theo@demo.com" },
  ];

  const plans: Array<{ plan: BillingRecord["plan"]; interval: BillingRecord["interval"]; base: number }> = [
    { plan: "PRO", interval: "month", base: 49 },
    { plan: "ELITE", interval: "month", base: 99 },
    { plan: "PRO", interval: "year", base: 499 },
    { plan: "ELITE", interval: "year", base: 999 },
  ];

  const days = daysBetween(range.from, range.to);
  const start = startOfDay(range.from);

  for (let i = 0; i < days; i++) {
    // nb de tentatives par jour
    const attempts = Math.floor(rnd() * 4); // 0..3
    for (let k = 0; k < attempts; k++) {
      const c = customers[Math.floor(rnd() * customers.length)];
      const p = plans[Math.floor(rnd() * plans.length)];

      const ts =
        start +
        i * 86400000 +
        Math.floor(rnd() * 20) * 3600000 +
        Math.floor(rnd() * 60) * 60000;

      const amount = p.base + Math.round((rnd() - 0.5) * 10);
      const fee = clamp(amount * (0.03 + rnd() * 0.02), 0.6, 6);
      const netAmount = amount - fee;

      const r = rnd();
      let status: BillingStatus = "paid";
      if (r < 0.08) status = "failed";
      else if (r < 0.10) status = "refunded";
      else if (r < 0.11) status = "disputed";
      else if (r < 0.12) status = "unpaid";

      out.push({
        id: `pay_${i}_${k}_${Math.floor(rnd() * 999999)}`,
        createdAt: ts,
        currency: "USD",
        amount,
        netAmount,
        status,
        customerId: c.id,
        customerName: c.name,
        customerEmail: c.email,
        plan: p.plan,
        interval: p.interval,
      });
    }
  }

  return out;
}

/* ----------------------- API (mock) ----------------------- */

export async function loadBillingRecords(range: BillingRange): Promise<BillingRecord[]> {
  // mock async
  await new Promise((r) => setTimeout(r, 120));
  return makeMockRecords(range);
}

/* ----------------------- Aggregations ----------------------- */

export type BillingKpis = {
  paidCount: number;
  failedCount: number;
  refundedCount: number;
  disputedCount: number;
  unpaidCount: number;

  gross: number;
  net: number;

  newCustomers: number;
  uniqueCustomers: number;

  topCustomers: Array<{ customerId: string; name: string; total: number; count: number }>;

  // sparkline daily series
  seriesGross: number[];
  seriesNet: number[];
  seriesNewCustomers: number[];
};

export function computeBillingKpis(records: BillingRecord[], range: BillingRange): BillingKpis {
  const paid = records.filter((r) => r.status === "paid");
  const failed = records.filter((r) => r.status === "failed");
  const refunded = records.filter((r) => r.status === "refunded");
  const disputed = records.filter((r) => r.status === "disputed");
  const unpaid = records.filter((r) => r.status === "unpaid");

  const gross = paid.reduce((a, r) => a + r.amount, 0);
  const net = paid.reduce((a, r) => a + r.netAmount, 0);

  // customers
  const customersAll = new Set(records.map((r) => r.customerId));
  const customersPaid = new Set(paid.map((r) => r.customerId));

  // "new customers" = first time seen in this range (mock)
  // (quand tu auras Stripe: compare à l’historique global)
  const firstSeen = new Map<string, number>();
  for (const r of records) {
    const prev = firstSeen.get(r.customerId);
    if (!prev || r.createdAt < prev) firstSeen.set(r.customerId, r.createdAt);
  }
  const newCustomers = Array.from(firstSeen.values()).filter(
    (ts) => ts >= range.from && ts <= range.to
  ).length;

  // top customers (paid)
  const byCust = new Map<string, { name: string; total: number; count: number }>();
  for (const r of paid) {
    const cur = byCust.get(r.customerId) || { name: r.customerName, total: 0, count: 0 };
    cur.total += r.amount;
    cur.count += 1;
    cur.name = r.customerName || cur.name;
    byCust.set(r.customerId, cur);
  }
  const topCustomers = Array.from(byCust.entries())
    .map(([customerId, v]) => ({ customerId, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // series daily
  const days = daysBetween(range.from, range.to);
  const start = startOfDay(range.from);

  const seriesGross = Array.from({ length: days }, () => 0);
  const seriesNet = Array.from({ length: days }, () => 0);
  const seriesNewCustomers = Array.from({ length: days }, () => 0);

  // per day gross/net
  for (const r of paid) {
    const idx = Math.floor((startOfDay(r.createdAt) - start) / 86400000);
    if (idx >= 0 && idx < days) {
      seriesGross[idx] += r.amount;
      seriesNet[idx] += r.netAmount;
    }
  }

  // per day new customers
  for (const [_, ts] of firstSeen.entries()) {
    const idx = Math.floor((startOfDay(ts) - start) / 86400000);
    if (idx >= 0 && idx < days) seriesNewCustomers[idx] += 1;
  }

  return {
    paidCount: paid.length,
    failedCount: failed.length,
    refundedCount: refunded.length,
    disputedCount: disputed.length,
    unpaidCount: unpaid.length,

    gross,
    net,

    newCustomers,
    uniqueCustomers: customersAll.size,

    topCustomers,

    seriesGross,
    seriesNet,
    seriesNewCustomers,
  };
}
