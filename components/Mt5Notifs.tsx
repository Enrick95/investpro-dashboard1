"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pushNotif } from "../lib/notifyStore";
import { loadMt5Accounts, Mt5Account } from "../lib/mt5Store";
import { getCurrentAccount } from "../lib/authStore";

type Deal = {
  ticket: number;
  position_id: number;
  time: number; // unix seconds
  symbol: string;
  profit: number;
  commission: number;
  swap: number;
  entry: number; // 1 = OUT (close)
};

function keyForAccount(a: Mt5Account) {
  return `investpro_mt5_notifs_v2_${a.login}_${a.server}`;
}

function classifyClose(pnl: number) {
  if (pnl > 0.0001) return "tp";
  if (pnl < -0.0001) return "sl";
  return "be";
}

export default function Mt5Notifs() {
  const me = getCurrentAccount();
  const enabled = !!me;

  const acc = useMemo(() => {
    const list = loadMt5Accounts();
    return list.find((x) => x.status === "CONNECTED") ?? null;
  }, [enabled]);

  // deals déjà notifiés (clé stable)
  const seenRef = useRef<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled || !acc) return;

    try {
      const raw = localStorage.getItem(keyForAccount(acc));
      const parsed = raw ? JSON.parse(raw) : null;

      const seen = Array.isArray(parsed?.seen) ? parsed.seen : [];
      seenRef.current = new Set<string>(seen.map(String));
    } catch {
      seenRef.current = new Set();
    }

    setReady(true);
  }, [enabled, acc?.id]);

  function persist() {
    if (!acc) return;
    try {
      // on limite pour éviter quota localStorage
      const arr = Array.from(seenRef.current);
      const last = arr.slice(Math.max(0, arr.length - 1200));

      localStorage.setItem(
        keyForAccount(acc),
        JSON.stringify({ seen: last })
      );
    } catch {
      // ignore quota
    }
  }

  async function fetchJson(url: string, body: any) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.error || "api_error");
    return j;
  }

  // (optionnel) éviter spam : on notifie “position ouverte” une seule fois par ticket
  const knownPosRef = useRef<Set<number>>(new Set());
  const knownOrdersRef = useRef<Set<number>>(new Set());

  async function poll() {
    if (!enabled || !acc) return;

    try {
      // positions (success)
      const posJ = await fetchJson("/api/mt5/positions", {
        broker: acc.broker,
        server: acc.server,
        login: acc.login,
        password: acc.password ?? "",
      });

      const positions: any[] = Array.isArray(posJ.positions) ? posJ.positions : [];
      const livePos = new Set<number>(
        positions.map((p) => Number(p.ticket)).filter((n) => Number.isFinite(n))
      );

      for (const p of positions) {
        const t = Number(p.ticket);
        if (!Number.isFinite(t)) continue;
        if (!knownPosRef.current.has(t)) {
          knownPosRef.current.add(t);
          pushNotif({
            kind: "success",
            title: "Position ouverte",
            message: `${p.symbol} • ${p.type === 0 ? "BUY" : "SELL"} • lots ${p.volume}`,
            ttlMs: 15000,
          });
        }
      }

      // cleanup
      for (const t of Array.from(knownPosRef.current)) {
        if (!livePos.has(t)) knownPosRef.current.delete(t);
      }

      // orders (pending)
      const ordJ = await fetchJson("/api/mt5/orders", {
        broker: acc.broker,
        server: acc.server,
        login: acc.login,
        password: acc.password ?? "",
      });

      const orders: any[] = Array.isArray(ordJ.orders) ? ordJ.orders : [];
      const liveOrders = new Set<number>(
        orders.map((o) => Number(o.ticket)).filter((n) => Number.isFinite(n))
      );

      for (const o of orders) {
        const t = Number(o.ticket);
        if (!Number.isFinite(t)) continue;
        if (!knownOrdersRef.current.has(t)) {
          knownOrdersRef.current.add(t);
          pushNotif({
            kind: "pending",
            title: "Ordre en attente",
            message: `${o.symbol} • ${o.type} • lots ${o.volume_current} • @ ${o.price_open}`,
            ttlMs: 15000,
          });
        }
      }

      for (const t of Array.from(knownOrdersRef.current)) {
        if (!liveOrders.has(t)) knownOrdersRef.current.delete(t);
      }

      // deals (TP/SL/BE)
      const to = Math.floor(Date.now() / 1000);
      const from = to - 24 * 3600; // 24h, mais dédupe par "seen"

      const histJ = await fetchJson("/api/mt5/history", {
        broker: acc.broker,
        server: acc.server,
        login: acc.login,
        password: acc.password ?? "",
        from_ts: from,
        to_ts: to,
      });

      const deals: Deal[] = Array.isArray(histJ.deals) ? histJ.deals : [];
      const closed = deals.filter((d) => Number(d.entry) === 1);

      let didPersist = false;

      for (const d of closed) {
        // clé stable : position + deal ticket + time
        const key = `close_${d.position_id}_${d.ticket}_${d.time}`;
        if (seenRef.current.has(key)) continue;

        seenRef.current.add(key);
        didPersist = true;

        const pnl =
          Number(d.profit ?? 0) + Number(d.commission ?? 0) + Number(d.swap ?? 0);

        const kind = classifyClose(pnl);

        pushNotif({
          kind,
          title: kind === "tp" ? "Take Profit" : kind === "sl" ? "Stop Loss" : "Break Even",
          message: `${d.symbol} • PnL ${pnl.toFixed(2)}$`,
          ttlMs: 15000,
        });
      }

      if (didPersist) persist();
    } catch {
      // silence: pas de spam
    }
  }

  useEffect(() => {
    if (!enabled || !acc || !ready) return;

    poll();
    const id = window.setInterval(poll, 10_000);
    return () => window.clearInterval(id);
  }, [enabled, acc?.id, ready]);

  return null;
}
