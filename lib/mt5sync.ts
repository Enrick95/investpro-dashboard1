import { loadTrades, saveTrades } from "./tradesStore";
import { getCurrentAccount, updateAccount } from "./authStore";
import { upsertLeaderboardUser } from "./uiStore";

type HistoryParams = {
  broker: string;
  server: string;
  login: string;
  password: string;
  from_ts: number;
  to_ts: number;
};

// ✅ plus bas = plus safe
const MAX_TRADES = 250;

// ⚠️ clé utilisée par ton erreur
const STORAGE_KEY = "investpro_trades_v2";

function capTrades<T>(arr: T[], max: number) {
  if (!Array.isArray(arr)) return [];
  return arr.length > max ? arr.slice(0, max) : arr;
}

function safeText(s: any, maxLen: number) {
  const str = String(s ?? "");
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function safeTags(tags: any, maxTags = 3) {
  if (!Array.isArray(tags)) return [];

  return tags
    .slice(0, maxTags)
    .map((t) => safeText(t, 16));
}

function resultFromPnl(pnl: number) {
  if (pnl > 0.0001) return "WIN";
  if (pnl < -0.0001) return "LOSS";
  return "BE";
}

function ymdFromUnix(ts: number) {
  const d = new Date(ts * 1000);

  const y = d.getFullYear();

  const m = String(
    d.getMonth() + 1
  ).padStart(2, "0");

  const dd = String(
    d.getDate()
  ).padStart(2, "0");

  return `${y}-${m}-${dd}`;
}

function isQuotaError(e: any) {
  const msg = String(
    e?.message ?? e ?? ""
  ).toLowerCase();

  return (
    msg.includes("quota") ||
    msg.includes("exceeded") ||
    msg.includes("storage")
  );
}

/**
 * Sync deals OUT -> tradesStore
 * + update profitUsd on user profile + leaderboard (local)
 */
export async function syncMt5HistoryToTrades(
  params: HistoryParams
): Promise<number> {
  const r = await fetch(
    "/api/mt5/history",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify(
        params
      ),
    }
  );

  const j = await r.json();

  if (!r.ok || !j?.ok) {
    throw new Error(
      j?.error ||
        "history error"
    );
  }

  const deals: any[] =
    Array.isArray(j.deals)
      ? j.deals
      : [];

  // MT5: entry often 0=IN, 1=OUT (closing)
  const outDeals =
    deals.filter(
      (d) => d.entry === 1
    );

  const trades =
    loadTrades();

  const existing =
    new Set(
      trades.map(
        (t: any) => t.id
      )
    );

  /*
   * ✅ IMPORTANT
   * Trade exige désormais un owner.
   * On utilise le compte actuellement connecté.
   */
  const currentAccount =
    getCurrentAccount();

  const owner =
    currentAccount?.username ||
    "unknown";

  let added = 0;

  for (const d of outDeals) {
    const id =
      `mt5_${d.position_id}_${d.ticket}`;

    if (existing.has(id)) {
      continue;
    }

    const pnl =
      Number(
        d.profit ?? 0
      ) +
      Number(
        d.commission ?? 0
      ) +
      Number(
        d.swap ?? 0
      );

    // ✅ trade compact
    trades.unshift({
      id,

      // ✅ champ obligatoire
      owner,

      date: ymdFromUnix(
        Number(d.time) || 0
      ),

      symbol: safeText(
        d.symbol,
        24
      ),

      market: "forex",

      side: "BUY",

      pnl: Number(
        pnl.toFixed(2)
      ),

      result:
        resultFromPnl(pnl),

      setup: "mt5",

      tags: safeTags([
        "mt5",
        "auto",
      ]),

      discipline: 10,

      note: safeText(
        `MT5 sync • pos=${d.position_id} • order=${d.order}`,
        80
      ),
    });

    existing.add(id);

    added += 1;
  }

  // ✅ limiter avant save
  const capped =
    capTrades(
      trades,
      MAX_TRADES
    );

  /*
   * ✅ try save
   * si quota → purge clé puis sauver une version allégée
   */
  try {
    saveTrades(capped);
  } catch (e: any) {
    if (isQuotaError(e)) {
      try {
        localStorage.removeItem(
          STORAGE_KEY
        );
      } catch {}

      /*
       * On conserve TOUS les champs requis par Trade,
       * même dans la version légère.
       */
      const ultra =
        capTrades(
          capped.map(
            (t: any) => ({
              id: t.id,

              owner:
                t.owner ||
                owner,

              date:
                t.date,

              symbol:
                t.symbol,

              market:
                t.market ||
                "forex",

              side:
                t.side ||
                "BUY",

              pnl:
                Number(
                  t.pnl || 0
                ),

              result:
                t.result ||
                "BE",

              setup:
                t.setup ||
                "mt5",

              tags:
                safeTags(
                  t.tags,
                  2
                ),

              discipline:
                Number(
                  t.discipline ??
                    10
                ),

              note:
                safeText(
                  t.note || "",
                  80
                ),
            })
          ),
          150
        );

      saveTrades(ultra);
    } else {
      throw e;
    }
  }

  // Update profit for current logged user
  const me =
    getCurrentAccount();

  if (me) {
    const totalProfit =
      capped.reduce(
        (
          s: number,
          t: any
        ) =>
          s +
          (
            Number(
              t.pnl
            ) || 0
          ),
        0
      );

    const updated =
      updateAccount({
        profitUsd:
          Number(
            totalProfit.toFixed(
              2
            )
          ),
      });

    if (
      updated &&
      (updated as any)
        .showOnLeaderboard
    ) {
      upsertLeaderboardUser(
        updated as any
      );
    }
  }

  return added;
}