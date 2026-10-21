"use client";

import type {Trade as TelegramTrade} from "@/lib/telegram/engine";
import { useLocale } from "@/components/i18n/LocaleProvider";
import VipTelegram from "@/components/telegram/VipTelegram";
import VipPerformanceReport from "@/components/vip/VipPerformanceReport";
import PublicVipPerformance from "@/components/vip/PublicVipPerformance";
import { buildVipPerformanceReport, type ReportTrade } from "@/lib/vip/performance-report";
import { containsReportDay, reportPeriodRange } from "@/lib/vip/performance-report-period";
import { tradeDay } from "@/lib/performance";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Edit3,
  Eye,
  ImageIcon,
  Minus,
  Plus,
  Search,
  Target,
  Trash2,
  Trophy,
  Upload,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/* =========================================================
   TYPES
========================================================= */

type TradeStatus =
  | "open"
  | "win"
  | "loss"
  | "breakeven"
  | "cancelled"
  | "review";

type Direction =
  | "buy"
  | "sell";

type Period =
  | "7d"
  | "month"
  | "3m"
  | "year"
  | "all";

type VipTrade = {
  source?: "telegram" | "manual";
  id: number;

  trade_date: string;

  symbol: string;

  direction: Direction;

  entry_price: number | null;

  stop_loss: number | null;

  take_profit: number | null;

  status: TradeStatus;

  result_r: number;

  pips: number;

  setup: string | null;

  timeframe: string | null;

  session: string | null;

  comment: string | null;

  screenshot_url: string | null;

  created_by: string | null;

  created_at: string;

  updated_at: string;
};

type TradeForm = {
  trade_date: string;

  symbol: string;

  direction: Direction;

  entry_price: string;

  stop_loss: string;

  take_profit: string;

  status: TradeStatus;

  result_r: string;

  pips: string;

  setup: string;

  timeframe: string;

  session: string;

  comment: string;
};

/* =========================================================
   DEFAULT FORM
========================================================= */

const emptyForm: TradeForm = {
  trade_date: new Date()
    .toISOString()
    .slice(0, 10),

  symbol: "",

  direction: "buy",

  entry_price: "",

  stop_loss: "",

  take_profit: "",

  status: "open",

  result_r: "0",

  pips: "0",

  setup: "",

  timeframe: "",

  session: "",

  comment: "",
};

/* =========================================================
   HELPERS
========================================================= */

function numberOrNull(
  value: string
) {
  const clean = value
    .trim()
    .replace(",", ".");

  if (!clean) {
    return null;
  }

  const parsed =
    Number(clean);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : null;
}

function numberOrZero(
  value: string
) {
  return (
    numberOrNull(value) ??
    0
  );
}

function formatDate(
  value: string, locale: "fr" | "en" = "fr"
) {
  return new Date(
    value
  ).toLocaleDateString(
    (locale === "en" ? "en-US" : "fr-FR"),
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function statusLabel(
  status: TradeStatus
) {
  switch (status) {
    case "win":
      return "WIN";

    case "loss":
      return "LOSS";

    case "breakeven":
      return "BE";

    case "open":
      return "OUVERT";

    case "review":
      return "À VÉRIFIER";
    case "cancelled":
      return "ANNULÉ";
  }
}

function statusClass(
  status: TradeStatus
) {
  switch (status) {
    case "win":
      return `
        border-emerald-500/20
        bg-emerald-500/10
        text-emerald-400
      `;

    case "loss":
      return `
        border-red-500/20
        bg-red-500/10
        text-red-400
      `;

    case "breakeven":
      return `
        border-blue-500/20
        bg-blue-500/10
        text-blue-400
      `;

    case "open":
      return `
        border-[color:var(--gold-border)]
        bg-[color:var(--gold-soft)]
        text-[color:var(--gold)]
      `;

    case "review":
    case "cancelled":
      return `
        border-white/10
        bg-white/5
        text-white/40
      `;
  }
}

/* =========================================================
   PAGE
========================================================= */

export default function PerformancesVipPage() {
  const { t: tr, locale } = useLocale();
  const [publicView, setPublicView] = useState(true);
  const [telegramTrades,setTelegramTrades]=useState<TelegramTrade[]>([]);
  const [telegramStatus,setTelegramStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [canReport,setCanReport]=useState(false);
  const loadVersion=useRef(0);
  const activeUserId=useRef<string|null>(null);
  const [manualError,setManualError]=useState('');
  const [source,setSource]=useState<'all'|'telegram'|'manual'>('all');
  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    );

  const [
    trades,
    setTrades,
  ] =
    useState<VipTrade[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    isAdmin,
    setIsAdmin,
  ] =
    useState(false);

  const [
    userId,
    setUserId,
  ] =
    useState<string | null>(
      null
    );

  const [
    period,
    setPeriod,
  ] =
    useState<Period>("7d");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    modalOpen,
    setModalOpen,
  ] =
    useState(false);

  const [
    editingTrade,
    setEditingTrade,
  ] =
    useState<VipTrade | null>(
      null
    );

  const [
    form,
    setForm,
  ] =
    useState<TradeForm>({
      ...emptyForm,
    });

  const [screenshotFile, setScreenshotFile] =
    useState<File | null>(null);

  const [screenshotPreview, setScreenshotPreview] =
    useState<string | null>(null);

  const [removeExistingScreenshot, setRemoveExistingScreenshot] =
    useState(false);

  const [screenshotUrls, setScreenshotUrls] =
    useState<Record<number, string>>({});

  const [viewingScreenshot, setViewingScreenshot] =
    useState<string | null>(null);

  /* =======================================================
     LOAD
  ======================================================= */

  useEffect(() => {
    void loadPage();
    let reload: ReturnType<typeof setTimeout> | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user.id ?? null;
      if (nextId === activeUserId.current) return;
      activeUserId.current = nextId;
      loadVersion.current++;
      setCanReport(false); setIsAdmin(false); setTrades([]); setTelegramTrades([]);
      setPublicView(true);
      setTelegramStatus('loading'); setUserId(null);
      if (reload) clearTimeout(reload);
      reload = setTimeout(() => { void loadPage(); }, 0);
    });
    return () => { loadVersion.current++; subscription.unsubscribe(); if (reload) clearTimeout(reload); };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (screenshotPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(screenshotPreview);
      }
    };
  }, [screenshotPreview]);

  async function loadPage() {
    const version = ++loadVersion.current;
    try {
      setLoading(true);
      setCanReport(false);

      const {
        data: {
          user,
        },
      } =
        await supabase
          .auth
          .getUser();

      if (version !== loadVersion.current) return;
      if (!user) {
        setPublicView(true);
        return;
      }

      setUserId(
        user.id
      );
      activeUserId.current = user.id;

      const adminAccess = (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return false;
          const response = await fetch('/api/admin/me', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
          if (!response.ok) return false;
          const access = await response.json();
          return access.owner === true || (Array.isArray(access.permissions) && access.permissions.includes('users_write'));
        } catch { return false; }
      })();
      const reportAccess = await adminAccess;
      if (version !== loadVersion.current) return;
      if (!reportAccess) {
        setPublicView(true);
        return;
      }
      // Fetch every page so an export cannot silently omit older losses at 1,000 rows.
      const manualTrades = (async () => {
        const data: VipTrade[] = [];
        let cursor: number | null = null;
        for (let offset = 0; offset < 100000; offset += 1000) {
          let query = supabase.from('vip_trades').select('*').order('id', { ascending: false }).limit(1000);
          if (cursor !== null) query = query.lt('id', cursor);
          const page = await query;
          if (page.error) return { data: null, error: page.error };
          data.push(...(page.data as VipTrade[]));
          if (page.data.length < 1000) return { data, error: null };
          cursor = Number(page.data[page.data.length - 1].id);
          if (!Number.isSafeInteger(cursor)) return { data: null, error: new Error('Invalid history cursor') };
        }
        return { data: null, error: new Error('History limit reached') };
      })();
      const tradesResult = await manualTrades;
      if (version !== loadVersion.current) return;
      setCanReport(reportAccess);

      if (
        tradesResult.error
      ) {
        setManualError(tr("Historique manuel indisponible : les totaux affichés peuvent être incomplets."));
        console.error(
          "Erreur trades VIP :",
          tradesResult.error
        );
      } else {
        const loadedTrades =
          (tradesResult.data as VipTrade[]) || [];

        setManualError('');
        setTrades(loadedTrades);
        await loadScreenshotUrls(loadedTrades);
      }

      if (version !== loadVersion.current) return;
      setIsAdmin(
        user.email?.toLowerCase() ===
          "louisiusenrick@gmail.com"
      );
      setPublicView(false);
    } catch (
      error
    ) {
      if (version !== loadVersion.current) return;
      setPublicView(true);
      setManualError(tr("Historique manuel indisponible : les totaux affichés peuvent être incomplets."));
      setCanReport(false);
      console.error(
        "Erreur performances VIP :",
        error
      );
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }

  const verifyReportAccess = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.id !== activeUserId.current) return false;
      const response = await fetch('/api/admin/me', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      if (!response.ok) return false;
      const access = await response.json();
      return session.user.id === activeUserId.current && (access.owner === true || (Array.isArray(access.permissions) && access.permissions.includes('users_write')));
    } catch { return false; }
  }, [supabase]);
  const handleTelegramStatus = useCallback((next: 'loading'|'ready'|'error') => {
    // Keep the last successfully loaded snapshot during a background refresh.
    setTelegramStatus(current => next === 'loading' && current === 'ready' ? 'ready' : next);
  }, []);

  /* =======================================================
     SCREENSHOTS VIP
  ======================================================= */

  async function loadScreenshotUrls(tradeList: VipTrade[]) {
    const items = tradeList.filter(
      (trade) => !!trade.screenshot_url
    );

    if (items.length === 0) {
      setScreenshotUrls({});
      return;
    }

    const pairs = await Promise.all(
      items.map(async (trade) => {
        const stored = trade.screenshot_url!;

        if (
          stored.startsWith("http://") ||
          stored.startsWith("https://")
        ) {
          return [trade.id, stored] as const;
        }

        const { data, error } =
          await supabase.storage
            .from("vip-trade-screenshots")
            .createSignedUrl(stored, 60 * 60);

        if (error || !data?.signedUrl) {
          console.error("Erreur URL capture VIP :", error);
          return null;
        }

        return [trade.id, data.signedUrl] as const;
      })
    );

    const map: Record<number, string> = {};

    pairs.forEach((pair) => {
      if (pair) {
        map[pair[0]] = pair[1];
      }
    });

    setScreenshotUrls(map);
  }

  function selectScreenshot(file: File | null) {
    if (!file) return;

    const allowed = [
      "image/png",
      "image/jpeg",
      "image/webp",
    ];

    if (!allowed.includes(file.type)) {
      alert(tr("Utilise une image PNG, JPG/JPEG ou WEBP."));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert(tr("La capture ne doit pas dépasser 5 Mo."));
      return;
    }

    if (screenshotPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(screenshotPreview);
    }

    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
    setRemoveExistingScreenshot(false);
  }

  function removeScreenshotFromForm() {
    if (screenshotPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(screenshotPreview);
    }

    setScreenshotFile(null);
    setScreenshotPreview(null);

    if (editingTrade?.screenshot_url) {
      setRemoveExistingScreenshot(true);
    }
  }

  async function uploadVipScreenshot(file: File) {
    if (!userId) {
      throw new Error(tr("Utilisateur non connecté."));
    }

    const extension =
      file.name.split(".").pop()?.toLowerCase() || "jpg";

    const unique =
      typeof crypto !== "undefined" &&
      "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`;

    const path =
      `${userId}/${Date.now()}-${unique}.${extension}`;

    const { error } =
      await supabase.storage
        .from("vip-trade-screenshots")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

    if (error) throw error;

    return path;
  }

  async function deleteStoredScreenshot(
    path: string | null
  ) {
    if (
      !path ||
      path.startsWith("http://") ||
      path.startsWith("https://")
    ) {
      return;
    }

    const { error } =
      await supabase.storage
        .from("vip-trade-screenshots")
        .remove([path]);

    if (error) {
      console.error(
        "Erreur suppression capture VIP :",
        error
      );
    }
  }

  const currentScreenshotPreview =
    screenshotPreview ||
    (
      !removeExistingScreenshot &&
      editingTrade?.screenshot_url
        ? screenshotUrls[editingTrade.id] || null
        : null
    );

  /* =======================================================
     FILTER
  ======================================================= */

  const combinedTrades = useMemo<VipTrade[]>(()=>[
    ...trades.map(t=>({...t,source:'manual' as const})),
    ...telegramTrades.map(t=>({
      id:-t.id,source:'telegram' as const,trade_date:t.date,symbol:t.asset,
      direction:t.side.toLowerCase() as Direction,entry_price:t.entry,stop_loss:t.sl,
      take_profit:t.target?t.targets[t.target-1]:t.targets[0]??null,
      status:(t.status==='be'?'breakeven':t.status==='pending'?'open':t.status) as TradeStatus,
      result_r:t.r??0,pips:0,setup:`Telegram · ${t.target?'TP'+t.target:tr("Signal")}`,
      timeframe:null,session:null,comment:null,screenshot_url:null,created_by:null,
      created_at:t.date,updated_at:t.date
    }))
  ].sort((a,b)=>b.trade_date.localeCompare(a.trade_date)||a.id-b.id),[trades,telegramTrades, tr]);

  const selectedRange = reportPeriodRange(period);
  const filteredTrades =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return combinedTrades.filter(
        (trade) => {
          if(source!=='all'&&trade.source!==source)return false;
          if (!containsReportDay(trade.trade_date, { start: selectedRange.start, end: selectedRange.end })) return false;

          if (!query) {
            return true;
          }

          const haystack =
            [
              trade.symbol,
              trade.setup,
              trade.timeframe,
              trade.session,
              trade.comment,
              trade.status,
              trade.direction,
            ]
              .filter(
                Boolean
              )
              .join(" ")
              .toLowerCase();

          return haystack.includes(
            query
          );
        }
      );
    }, [
      combinedTrades,
      source,
      selectedRange.start,
      selectedRange.end,
      search,
    ]);

  /* =======================================================
     STATS
  ======================================================= */

  const reportTrades = useMemo<ReportTrade[]>(() => {
    const telegramById = new Map(telegramTrades.map(trade => [trade.id, trade]));
    return filteredTrades.map(trade => {
      const original = trade.source === 'telegram' ? telegramById.get(-trade.id) : null;
      return {
        id: `${trade.source}:${trade.id}`, date: tradeDay(trade.trade_date), symbol: trade.symbol,
        direction: trade.direction, status: trade.status, source: trade.source === 'telegram' ? 'telegram' : 'manual',
        resultR: original ? original.r : trade.result_r == null ? null : Number(trade.result_r),
        target: original?.target ?? null,
      };
    });
  }, [filteredTrades, telegramTrades]);
  const performanceReport = useMemo(() => buildVipPerformanceReport(reportTrades), [reportTrades]);
  const reportReady = !loading && (source === 'telegram' || !manualError) && (source === 'manual' || telegramStatus === 'ready');
  const reportDayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', year: 'numeric' });
  const reportPeriod = `${{ '7d': locale === 'en' ? 'Last 7 days' : '7 derniers jours', month: locale === 'en' ? 'This month' : 'Ce mois', '3m': locale === 'en' ? 'Last 3 months' : '3 derniers mois', year: locale === 'en' ? 'This year' : 'Cette année', all: locale === 'en' ? 'All history' : 'Tout l’historique' }[period]}${selectedRange.start ? ` · ${reportDayLabel(selectedRange.start)}` : ''} → ${reportDayLabel(selectedRange.end)} · ${locale === 'en' ? 'Paris time' : 'Heure de Paris'}`;
  const reportFilter = `${source === 'all' || source === 'telegram' ? (locale === 'en' ? 'Telegram automatic synchronization' : 'Telegram synchronisation automatique') : (locale === 'en' ? 'Manual records' : 'Saisies manuelles')}${search.trim() ? ` · ${locale === 'en' ? 'Search' : 'Recherche'} : ${search.trim()}` : ''}`;

  const stats =
    useMemo(() => {
      const valid =
        filteredTrades.filter(
          (trade) =>
            trade.status !==
              "cancelled" &&
            trade.status !==
              "open" && trade.status !== "review"
        );

      const wins =
        valid.filter(
          (trade) =>
            trade.status ===
            "win"
        ).length;

      const losses =
        valid.filter(
          (trade) =>
            trade.status ===
            "loss"
        ).length;

      const breakevens =
        valid.filter(
          (trade) =>
            trade.status ===
            "breakeven"
        ).length;

      const counted =
        wins + losses;

      const winrate =
        counted > 0
          ? (
              wins /
              counted
            ) * 100
          : 0;

      const totalR =
        valid.reduce(
          (
            total,
            trade
          ) =>
            total +
            Number(
              trade.result_r ||
                0
            ),
          0
        );

      const totalPips =
        valid.reduce(
          (
            total,
            trade
          ) =>
            total +
            Number(
              trade.pips ||
                0
            ),
          0
        );

      return {
        total:
          valid.length,

        wins,

        losses,

        breakevens,

        winrate,

        totalR,

        totalPips,
      };
    }, [
      filteredTrades,
    ]);

  /* =======================================================
     CHART
  ======================================================= */

  const chartData =
    useMemo(() => {
      const sorted =
        [...filteredTrades]
          .filter(
            (trade) =>
              trade.status ===
                "win" ||
              trade.status ===
                "loss" ||
              trade.status ===
                "breakeven"
          )
          .sort(
            (
              a,
              b
            ) =>
              new Date(
                a.trade_date
              ).getTime() -
              new Date(
                b.trade_date
              ).getTime()
          );

      if(!sorted.length)return [];
      let cumulative =
        0;

      return [{id:0,value:0}, ...sorted.map(
        (trade) => {
          cumulative +=
            Number(
              trade.result_r ||
                0
            );

          return {
            id:
              trade.id,

            value:
              cumulative,
          };
        }
      )];
    }, [
      filteredTrades,
    ]);

  const chartPoints =
    useMemo(() => {
      if (
        chartData.length ===
        0
      ) {
        return "";
      }

      const values =
        chartData.map(
          (item) =>
            item.value
        );

      const min =
        Math.min(
          ...values,
          0
        );

      const max =
        Math.max(
          ...values,
          0
        );

      const range =
        Math.max(
          max - min,
          1
        );

      return chartData
        .map(
          (
            item,
            index
          ) => {
            const x =
              chartData.length ===
              1
                ? 500
                : (
                    index /
                    (
                      chartData.length -
                      1
                    )
                  ) *
                  1000;

            const y =
              260 -
              (
                (
                  item.value -
                  min
                ) /
                range
              ) *
                220;

            return `${x},${y}`;
          }
        )
        .join(" ");
    }, [
      chartData,
    ]);

  /* =======================================================
     MODAL
  ======================================================= */

  function openNewTrade() {
    setEditingTrade(null);

    if (screenshotPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(screenshotPreview);
    }

    setScreenshotFile(null);
    setScreenshotPreview(null);
    setRemoveExistingScreenshot(false);

    setForm({
      ...emptyForm,

      trade_date:
        new Date()
          .toISOString()
          .slice(
            0,
            10
          ),
    });

    setModalOpen(
      true
    );
  }

  function openEditTrade(
    trade: VipTrade
  ) {
    if(trade.source==="telegram")return;
    setEditingTrade(trade);

    if (screenshotPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(screenshotPreview);
    }

    setScreenshotFile(null);
    setScreenshotPreview(null);
    setRemoveExistingScreenshot(false);

    setForm({
      trade_date:
        trade.trade_date.slice(
          0,
          10
        ),

      symbol:
        trade.symbol,

      direction:
        trade.direction,

      entry_price:
        trade.entry_price !=
        null
          ? String(
              trade.entry_price
            )
          : "",

      stop_loss:
        trade.stop_loss !=
        null
          ? String(
              trade.stop_loss
            )
          : "",

      take_profit:
        trade.take_profit !=
        null
          ? String(
              trade.take_profit
            )
          : "",

      status:
        trade.status,

      result_r:
        String(
          trade.result_r ??
            0
        ),

      pips:
        String(
          trade.pips ??
            0
        ),

      setup:
        trade.setup || "",

      timeframe:
        trade.timeframe ||
        "",

      session:
        trade.session || "",

      comment:
        trade.comment || "",
    });

    setModalOpen(
      true
    );
  }

  function updateStatus(
    status: TradeStatus
  ) {
    setForm(
      (current) => {
        let resultR =
          current.result_r;

        let pips =
          current.pips;

        if (
          status === "loss"
        ) {
          resultR = "-1";
        }

        if (
          status ===
          "breakeven"
        ) {
          resultR = "0";
          pips = "0";
        }

        if (
          status === "open" ||
          status ===
            "cancelled"
        ) {
          resultR = "0";
          pips = "0";
        }

        return {
          ...current,
          status,
          result_r:
            resultR,
          pips,
        };
      }
    );
  }

  /* =======================================================
     SAVE
  ======================================================= */

  async function saveTrade() {
    if (
      !isAdmin ||
      !userId
    ) {
      return;
    }

    const symbol =
      form.symbol
        .trim()
        .toUpperCase();

    if (!symbol) {
      alert(
        tr("Renseigne l'actif.")
      );

      return;
    }

    let uploadedScreenshotPath: string | null = null;

    let finalScreenshotPath: string | null =
      editingTrade?.screenshot_url || null;

    try {
      setSaving(true);

      if (removeExistingScreenshot) {
        finalScreenshotPath = null;
      }

      if (screenshotFile) {
        uploadedScreenshotPath =
          await uploadVipScreenshot(screenshotFile);

        finalScreenshotPath = uploadedScreenshotPath;
      }

      const payload = {
        trade_date:
          new Date(
            `${form.trade_date}T12:00:00`
          ).toISOString(),

        symbol,

        direction:
          form.direction,

        entry_price:
          numberOrNull(
            form.entry_price
          ),

        stop_loss:
          numberOrNull(
            form.stop_loss
          ),

        take_profit:
          numberOrNull(
            form.take_profit
          ),

        status:
          form.status,

        result_r:
          numberOrZero(
            form.result_r
          ),

        pips:
          numberOrZero(
            form.pips
          ),

        setup:
          form.setup.trim() ||
          null,

        timeframe:
          form.timeframe
            .trim() ||
          null,

        session:
          form.session
            .trim() ||
          null,

        comment:
          form.comment.trim() ||
          null,

        screenshot_url:
          finalScreenshotPath,

        created_by:
          userId,

        updated_at:
          new Date()
            .toISOString(),
      };

      if (
        editingTrade
      ) {
        const {
          error,
        } =
          await supabase
            .from(
              "vip_trades"
            )
            .update(
              payload
            )
            .eq(
              "id",
              editingTrade.id
            );

        if (error) {
          throw error;
        }

        if (
          editingTrade.screenshot_url &&
          (
            removeExistingScreenshot ||
            (
              uploadedScreenshotPath &&
              uploadedScreenshotPath !==
                editingTrade.screenshot_url
            )
          )
        ) {
          await deleteStoredScreenshot(
            editingTrade.screenshot_url
          );
        }
      } else {
        const {
          error,
        } =
          await supabase
            .from(
              "vip_trades"
            )
            .insert(
              payload
            );

        if (error) {
          throw error;
        }
      }

      setModalOpen(
        false
      );

      await loadPage();
    } catch (
      error: unknown
    ) {
      console.error(
        error
      );

      if (uploadedScreenshotPath) {
        await deleteStoredScreenshot(
          uploadedScreenshotPath
        );
      }

      alert(
        (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : '') ||
          tr("Impossible d'enregistrer le trade.")
      );
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     DELETE
  ======================================================= */

  async function deleteTrade(
    trade: VipTrade
  ) {
    if (!isAdmin || trade.source==="telegram") {
      return;
    }

    const confirmed =
      window.confirm(
        (tr("Supprimer le trade ") + (trade.symbol) + " ?")
      );

    if (!confirmed) {
      return;
    }

    const {
      error,
    } =
      await supabase
        .from(
          "vip_trades"
        )
        .delete()
        .eq(
          "id",
          trade.id
        );

    if (error) {
      alert(
        tr("Impossible de supprimer le trade.")
      );

      return;
    }

    if (trade.screenshot_url) {
      await deleteStoredScreenshot(
        trade.screenshot_url
      );
    }

    setTrades(
      (current) =>
        current.filter(
          (item) =>
            item.id !==
            trade.id
        )
    );
  }

  /* =======================================================
     LOADING
  ======================================================= */

  if (publicView) return <PublicVipPerformance />;

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-sm text-[color:var(--muted)]">{tr("Chargement des performances VIP…")}</div>
      </div>
    );
  }

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    <>
      <div className="investpro-mobile-page space-y-4 pb-4 lg:space-y-5 lg:pb-10">
        <VipTelegram key={userId ?? 'guest'} connectionOnly onTrades={setTelegramTrades} onStatus={handleTelegramStatus} />
        <div className="space-y-5 pt-5">
        {manualError&&<p role="alert" className="text-amber-400">{manualError}</p>}

        {/* HEADER */}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div
              className="
                mb-3
                inline-flex
                items-center
                gap-2
                rounded-full
                border
                border-[color:var(--gold-border)]
                bg-[color:var(--gold-soft)]
                px-3
                py-1.5
                text-[10px]
                font-semibold
                uppercase
                tracking-[0.13em]
                text-[color:var(--gold)]
              "
            >
              <Activity
                size={12}
              />{tr("Groupe privé InvestPro")}</div>

            <h1 className="text-2xl font-semibold text-white">{tr("Performances VIP")}</h1>

            <p className="mt-1 text-sm text-[color:var(--muted)]">{tr("Signaux Telegram et trades manuels réunis. Résultats en R ; Telegram suit le meilleur TP annoncé.")}</p>
          </div>

          {isAdmin ? (
            <button
              type="button"
              onClick={
                openNewTrade
              }
              className="
                inline-flex
                h-11
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-[color:var(--gold)]
                px-4
                text-sm
                font-semibold
                text-black
                transition
                hover:bg-[color:var(--gold-2)]
              "
            >
              <Plus
                size={16}
              />{tr("Ajouter un trade manuel")}</button>
          ) : null}
        </div>

        {/* HERO */}

        <section
          className="
            relative
            overflow-hidden
            rounded-[26px]
            border
            border-[color:var(--gold-border)]
            bg-[#0b0b0d]
            px-6
            py-6
            lg:px-7
          "
        >
          <div
            className="
              pointer-events-none
              absolute
              -right-20
              -top-24
              h-[300px]
              w-[300px]
              rounded-full
              bg-[color:var(--gold)]
              opacity-[0.07]
              blur-[90px]
            "
          />

          <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--gold)]">{tr("Bilan du groupe VIP")}</div>

              <h2 className="mt-2 text-xl font-semibold text-white lg:text-2xl">{tr("Suivi transparent des performances")}</h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">{tr("Chaque trade publié dans le groupe est enregistré ici afin de conserver un historique clair des résultats.")}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <PeriodButton
                active={
                  period ===
                  "7d"
                }
                onClick={() =>
                  setPeriod(
                    "7d"
                  )
                }
              >{tr("7 jours")}</PeriodButton>

              <PeriodButton
                active={
                  period ===
                  "month"
                }
                onClick={() =>
                  setPeriod(
                    "month"
                  )
                }
              >{tr("Ce mois")}</PeriodButton>

              <PeriodButton
                active={
                  period ===
                  "3m"
                }
                onClick={() =>
                  setPeriod(
                    "3m"
                  )
                }
              >{tr("3 mois")}</PeriodButton>

              <PeriodButton
                active={
                  period ===
                  "year"
                }
                onClick={() =>
                  setPeriod(
                    "year"
                  )
                }
              >{tr("Cette année")}</PeriodButton>

              <PeriodButton
                active={
                  period ===
                  "all"
                }
                onClick={() =>
                  setPeriod(
                    "all"
                  )
                }
              >{tr("Tout")}</PeriodButton>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <label>{tr("Source ")}<select className="rounded-xl border border-white/20 bg-black p-3" value={source} onChange={e=>setSource(e.target.value as typeof source)}>
            <option value="all">{tr("Tous les trades")}</option><option value="telegram">{tr("Telegram")}</option><option value="manual">{tr("Manuel")}</option>
          </select></label>
          <span className="text-sm text-[color:var(--muted)]">{filteredTrades.filter(t=>t.status==='open').length}{tr(" en attente · ")}{filteredTrades.filter(t=>t.status==='review').length}{tr(" à vérifier · ")}{filteredTrades.filter(t=>t.status==='cancelled').length}{tr(" annulé(s)")}</span>
        </div>
        {/* KPI */}

        <section
          className="
            grid
            grid-cols-2
            gap-3
            lg:grid-cols-3
            xl:grid-cols-6
          "
        >
          <StatCard
            icon={
              <BarChart3
                size={17}
              />
            }
            label={tr("Trades clôturés")}
            value={String(
              stats.total
            )}
          />

          <StatCard
            icon={
              <ArrowUpRight
                size={17}
              />
            }
            label={tr("Wins")}
            value={String(
              stats.wins
            )}
            positive
          />

          <StatCard
            icon={
              <ArrowDownRight
                size={17}
              />
            }
            label={tr("Losses")}
            value={String(
              stats.losses
            )}
            negative
          />

          <StatCard
            icon={
              <Minus
                size={17}
              />
            }
            label={tr("BE")}
            value={String(
              stats.breakevens
            )}
          />

          <StatCard
            icon={
              <Target
                size={17}
              />
            }
            label={tr("Winrate hors BE")}
            value={`${stats.winrate.toFixed(
              1
            )}%`}
          />

          <StatCard
            icon={
              <Trophy
                size={17}
              />
            }
            label={tr("Résultat")}
            value={performanceReport.totalR === null ? '—' : `${performanceReport.totalR > 0 ? '+' : ''}${new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(performanceReport.totalR)} R`}
            positive={performanceReport.totalR !== null && performanceReport.totalR > 0}
            negative={performanceReport.totalR !== null && performanceReport.totalR < 0}
            sub={`${locale === 'en' ? 'Average R/R' : 'R/R moyen'} : ${performanceReport.rewardRiskRatio === null ? '—' : new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 2 }).format(performanceReport.rewardRiskRatio)}`}
          />
        </section>

        {/* CHART */}

        <section
          className="
            rounded-[24px]
            border
            border-[color:var(--border)]
            bg-[color:var(--panel)]
            p-5
          "
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">{tr("Évolution de la performance")}</h2>

              <p className="mt-1 text-xs text-[color:var(--muted)]">{tr("Résultat cumulé en R sur la période sélectionnée.")}</p>
            </div>

            <div className="text-right">
              <div
                className={[
                  "text-xl font-bold",

                  stats.totalR >
                  0
                    ? "text-emerald-400"
                    : stats.totalR <
                      0
                    ? "text-red-400"
                    : "text-white",
                ].join(" ")}
              >
                {stats.totalR >=
                0
                  ? "+"
                  : ""}
                {stats.totalR.toFixed(
                  2
                )}{tr("R")}</div>
            </div>
          </div>

          <div
            className="
              relative
              mt-6
              h-[220px]
              lg:h-[260px]
              overflow-hidden
              rounded-2xl
              border
              border-white/[0.05]
              bg-black/20
            "
          >
            <div className="absolute inset-0">
              <div className="absolute left-0 right-0 top-1/4 border-t border-white/[0.05]" />

              <div className="absolute left-0 right-0 top-1/2 border-t border-white/[0.05]" />

              <div className="absolute left-0 right-0 top-3/4 border-t border-white/[0.05]" />
            </div>

            {chartPoints ? (
              <svg
                viewBox="0 0 1000 300"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full p-4"
              >
                <defs>
                  <linearGradient
                    id="vipGoldLine"
                    x1="0"
                    x2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#8b6a20"
                    />

                    <stop
                      offset="50%"
                      stopColor="#d4a934"
                    />

                    <stop
                      offset="100%"
                      stopColor="#f2c75b"
                    />
                  </linearGradient>
                </defs>

                <polyline
                  points={
                    chartPoints
                  }
                  fill="none"
                  stroke="url(#vipGoldLine)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-5">
                <div className="flex max-w-md flex-col items-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)]/80 px-6 py-5 text-center shadow-[0_12px_36px_rgba(0,0,0,0.18)]">
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
                    <BarChart3 size={20} aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-white">{tr("Votre courbe commencera ici")}</span>
                  <span className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{tr("Ajoutez un trade VIP pour suivre votre résultat cumulé en R sur cette période.")}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* TRADES */}

        <section
          className="
            overflow-hidden
            rounded-[24px]
            border
            border-[color:var(--border)]
            bg-[color:var(--panel)]
          "
        >
          <div
            className="
              flex
              flex-col
              gap-4
              border-b
              border-[color:var(--border)]
              p-5
              lg:flex-row
              lg:items-center
              lg:justify-between
            "
          >
            <div>
              <h2 className="text-sm font-semibold text-white">{tr("Historique des trades VIP")}</h2>

              <p className="mt-1 text-xs text-[color:var(--muted)]">
                {filteredTrades.length}{tr(" trade")}{filteredTrades.length !==
                1
                  ? "s"
                  : ""}{" "}{tr("affiché")}{filteredTrades.length !==
                1
                  ? "s"
                  : ""}
              </p>
            </div>

            {canReport && <div className="flex flex-col gap-1">
              <VipPerformanceReport trades={reportTrades} periodLabel={reportPeriod} filterLabel={reportFilter} locale={locale} disabled={!reportReady} authorize={verifyReportAccess} />
              {!reportReady && <p className="max-w-xs text-xs text-amber-300" role="status">{locale === 'en' ? 'The selected sources must load successfully before exporting.' : 'Les sources sélectionnées doivent être chargées sans erreur avant l’export.'}</p>}
            </div>}

            <div
              className="
                flex
                h-10
                w-full
                items-center
                gap-2
                rounded-xl
                border
                border-[color:var(--border)]
                bg-black/20
                px-3
                lg:w-[280px]
              "
            >
              <Search
                size={15}
                className="text-[color:var(--muted)]"
              />

              <input
                value={
                  search
                }
                onChange={(
                  event
                ) =>
                  setSearch(
                    event
                      .target
                      .value
                  )
                }
                placeholder={tr("Rechercher GOLD, setup...")}
                className="
                  w-full
                  bg-transparent
                  text-xs
                  text-white
                  outline-none
                  placeholder:text-white/25
                "
              />
            </div>
          </div>

          {filteredTrades.length >
          0 ? (
            <>
            <div className="lg:hidden divide-y divide-white/[0.06]">
              {filteredTrades.map((trade) => (
                <article key={trade.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={[
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                        trade.direction === "buy"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                          : "border-red-500/20 bg-red-500/10 text-red-400",
                      ].join(" ")}>
                        {trade.direction === "buy" ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{trade.symbol}</span>
                          <span className={["rounded-lg border px-2 py-1 text-[9px] font-bold", statusClass(trade.status)].join(" ")}>
                            {tr(statusLabel(trade.status))}
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                          {formatDate(trade.trade_date, locale)} • {trade.setup || tr("Manuel")}
                        </div>
                      </div>
                    </div>
                    <div className={["text-right text-base font-bold", trade.result_r > 0 ? "text-emerald-400" : trade.result_r < 0 ? "text-red-400" : "text-white/50"].join(" ")}>
                      {trade.status==='open'||trade.status==='review'||trade.status==='cancelled'?'—':`${trade.result_r>0?'+':''}${Number(trade.result_r).toFixed(2)} R`}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                      <div className="text-[8px] text-white/30">{tr("Entrée")}</div>
                      <div className="mt-1 truncate text-[10px] font-semibold text-white">{trade.entry_price ?? "—"}</div>
                    </div>


                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.05] pt-3">
                    <div className="text-[10px] text-[color:var(--muted)]">
                      {trade.source==='telegram'?tr("Telegram · synchronisé"):`Manuel · ${trade.pips} pips`}
                    </div>
                    <div className="flex items-center gap-2">
                      {screenshotUrls[trade.id] ? (
                        <button type="button" onClick={() => setViewingScreenshot(screenshotUrls[trade.id])} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
                          <Eye size={14} />
                        </button>
                      ) : null}
                      {isAdmin && trade.source!=="telegram" ? (
                        <>
                          <button type="button" onClick={() => openEditTrade(trade)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/60"><Edit3 size={14} /></button>
                          <button type="button" onClick={() => deleteTrade(trade)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/[0.05] text-red-400"><Trash2 size={14} /></button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    <TableHead>{tr("Date")}</TableHead>

                    <TableHead>{tr("Actif")}</TableHead>

                    <TableHead>{tr("Direction")}</TableHead>

                    <TableHead>{tr("Statut")}</TableHead>

                    <TableHead>{tr("Entrée")}</TableHead>



                    <TableHead>{tr("Résultat")}</TableHead>

                    <TableHead>{tr("Pips")}</TableHead>

                    <TableHead>{tr("Setup")}</TableHead>

                    <TableHead>{tr("Graphique")}</TableHead>

                    {isAdmin ? (
                      <TableHead>{tr("Actions")}</TableHead>
                    ) : null}
                  </tr>
                </thead>

                <tbody>
                  {filteredTrades.map(
                    (
                      trade
                    ) => (
                      <tr
                        key={
                          trade.id
                        }
                        className="
                          border-b
                          border-white/[0.04]
                          transition
                          last:border-b-0
                          hover:bg-white/[0.02]
                        "
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CalendarDays
                              size={
                                13
                              }
                              className="text-white/30"
                            />

                            {formatDate(
                              trade.trade_date, locale
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <span className="font-semibold text-white">
                            {
                              trade.symbol
                            }
                          </span>
                        </TableCell>

                        <TableCell>
                          <span
                            className={
                              trade.direction ===
                              "buy"
                                ? "text-emerald-400"
                                : "text-red-400"
                            }
                          >
                            {trade.direction ===
                            "buy"
                              ? "BUY"
                              : "SELL"}
                          </span>
                        </TableCell>

                        <TableCell>
                          <span
                            className={[
                              "inline-flex rounded-lg border px-2 py-1 text-[10px] font-bold",
                              statusClass(
                                trade.status
                              ),
                            ].join(
                              " "
                            )}
                          >
                            {tr(statusLabel(
                              trade.status
                            ))}
                          </span>
                        </TableCell>

                        <TableCell>
                          {trade.entry_price ??
                            "—"}
                        </TableCell>



                        <TableCell>
                          <span
                            className={
                              trade.result_r >
                              0
                                ? "font-semibold text-emerald-400"
                                : trade.result_r <
                                  0
                                ? "font-semibold text-red-400"
                                : "text-white/50"
                            }
                          >
                            {trade.status==='open'||trade.status==='review'||trade.status==='cancelled'?'—':`${trade.result_r>0?'+':''}${Number(trade.result_r).toFixed(2)} R`}
                          </span>
                        </TableCell>

                        <TableCell>
                          <span
                            className={
                              trade.pips >
                              0
                                ? "text-emerald-400"
                                : trade.pips <
                                  0
                                ? "text-red-400"
                                : "text-white/50"
                            }
                          >
                            {trade.source==='telegram'?'—':`${trade.pips>0?'+':''}${trade.pips}`}
                          </span>
                        </TableCell>

                        <TableCell>
                          {trade.source==='telegram'?trade.setup:`Manuel · ${trade.setup||tr("Sans setup")}`}
                        </TableCell>

                        <TableCell>
                          {screenshotUrls[trade.id] ? (
                            <button
                              type="button"
                              onClick={() =>
                                setViewingScreenshot(
                                  screenshotUrls[trade.id]
                                )
                              }
                              className="
                                inline-flex
                                h-8
                                items-center
                                gap-2
                                rounded-lg
                                border
                                border-[color:var(--gold-border)]
                                bg-[color:var(--gold-soft)]
                                px-3
                                text-[10px]
                                font-semibold
                                text-[color:var(--gold)]
                              "
                            >
                              <Eye size={12} />{tr("Voir")}</button>
                          ) : (
                            "—"
                          )}
                        </TableCell>

                        {isAdmin && trade.source==="telegram" ? <TableCell>{tr("Synchronisé")}</TableCell> : isAdmin ? (
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openEditTrade(
                                    trade
                                  )
                                }
                                className="
                                  flex
                                  h-8
                                  w-8
                                  items-center
                                  justify-center
                                  rounded-lg
                                  border
                                  border-white/10
                                  bg-white/[0.03]
                                  text-white/60
                                  transition
                                  hover:text-white
                                "
                              >
                                <Edit3
                                  size={
                                    13
                                  }
                                />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  deleteTrade(
                                    trade
                                  )
                                }
                                className="
                                  flex
                                  h-8
                                  w-8
                                  items-center
                                  justify-center
                                  rounded-lg
                                  border
                                  border-red-500/15
                                  bg-red-500/[0.05]
                                  text-red-400
                                  transition
                                  hover:bg-red-500/10
                                "
                              >
                                <Trash2
                                  size={
                                    13
                                  }
                                />
                              </button>
                            </div>
                          </TableCell>
                        ) : null}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
            </>
          ) : (
            <div className="px-5 py-16 text-center">
              <BarChart3
                size={30}
                className="mx-auto text-white/15"
              />

              <div className="mt-4 text-sm font-semibold text-white">{tr("Aucun trade VIP")}</div>

              <div className="mt-1 text-xs text-[color:var(--muted)]">{tr("Aucun trade ne correspond à la période sélectionnée.")}</div>
            </div>
          )}
        </section>
        </div>
      </div>

      {/* MODAL */}

      {modalOpen &&
      isAdmin ? (
        <div
          className="
            fixed
            inset-0
            z-[2000]
            flex
            items-center
            justify-center
            bg-black/75
            p-4
            backdrop-blur-sm
          "
        >
          <div
            className="
              max-h-[92vh]
              w-full
              max-w-[760px]
              overflow-y-auto
              rounded-[26px]
              border
              border-[color:var(--gold-border)]
              bg-[#0b0b0e]
              shadow-2xl
            "
          >
            <div
              className="
                sticky
                top-0
                z-10
                flex
                items-center
                justify-between
                border-b
                border-[color:var(--border)]
                bg-[#0b0b0e]/95
                px-6
                py-5
                backdrop-blur
              "
            >
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {editingTrade
                    ? tr("Modifier le trade VIP")
                    : tr("Ajouter un trade manuel")}
                </h2>

                <p className="mt-1 text-xs text-[color:var(--muted)]">{tr("Ce trade sera visible dans les performances officielles du groupe.")}</p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setModalOpen(
                    false
                  )
                }
                className="
                  flex
                  h-9
                  w-9
                  items-center
                  justify-center
                  rounded-xl
                  border
                  border-white/10
                  bg-white/[0.03]
                  text-white/60
                "
              >
                <X
                  size={16}
                />
              </button>
            </div>

            <div className="space-y-5 p-6">

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field
                  label={tr("Date")}
                >
                  <input
                    type="date"
                    value={
                      form.trade_date
                    }
                    onChange={(
                      event
                    ) =>
                      setForm({
                        ...form,
                        trade_date:
                          event
                            .target
                            .value,
                      })
                    }
                    className={
                      inputClass
                    }
                  />
                </Field>

                <Field
                  label={tr("Actif")}
                >
                  <input
                    value={
                      form.symbol
                    }
                    onChange={(
                      event
                    ) =>
                      setForm({
                        ...form,
                        symbol:
                          event
                            .target
                            .value
                            .toUpperCase(),
                      })
                    }
                    placeholder={tr("GOLD, EURUSD...")}
                    className={
                      inputClass
                    }
                  />
                </Field>

                <Field
                  label={tr("Direction")}
                >
                  <select
                    value={
                      form.direction
                    }
                    onChange={(
                      event
                    ) =>
                      setForm({
                        ...form,
                        direction:
                          event
                            .target
                            .value as Direction,
                      })
                    }
                    className={
                      inputClass
                    }
                  >
                    <option value="buy">{tr("BUY")}</option>

                    <option value="sell">{tr("SELL")}</option>
                  </select>
                </Field>

                <Field
                  label={tr("Résultat")}
                >
                  <select
                    value={
                      form.status
                    }
                    onChange={(
                      event
                    ) =>
                      updateStatus(
                        event
                          .target
                          .value as TradeStatus
                      )
                    }
                    className={
                      inputClass
                    }
                  >
                    <option value="open">{tr("OUVERT")}</option>

                    <option value="win">{tr("WIN")}</option>

                    <option value="loss">{tr("LOSS")}</option>

                    <option value="breakeven">{tr("BREAKEVEN")}</option>

                    <option value="cancelled">{tr("ANNULÉ")}</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Field
                  label={tr("Prix d'entrée")}
                >
                  <input
                    value={
                      form.entry_price
                    }
                    onChange={(
                      event
                    ) =>
                      setForm({
                        ...form,
                        entry_price:
                          event
                            .target
                            .value,
                      })
                    }
                    placeholder={tr("3375.50")}
                    className={
                      inputClass
                    }
                  />
                </Field>

                <Field
                  label={tr("Stop Loss")}
                >
                  <input
                    value={
                      form.stop_loss
                    }
                    onChange={(
                      event
                    ) =>
                      setForm({
                        ...form,
                        stop_loss:
                          event
                            .target
                            .value,
                      })
                    }
                    placeholder={tr("3385.00")}
                    className={
                      inputClass
                    }
                  />
                </Field>

                <Field
                  label={tr("Take Profit")}
                >
                  <input
                    value={
                      form.take_profit
                    }
                    onChange={(
                      event
                    ) =>
                      setForm({
                        ...form,
                        take_profit:
                          event
                            .target
                            .value,
                      })
                    }
                    placeholder={tr("3355.00")}
                    className={
                      inputClass
                    }
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field
                  label={tr("Résultat en R")}
                >
                  <input
                    value={
                      form.result_r
                    }
                    onChange={(
                      event
                    ) =>
                      setForm({
                        ...form,
                        result_r:
                          event
                            .target
                            .value,
                      })
                    }
                    placeholder={tr("+2")}
                    className={
                      inputClass
                    }
                  />
                </Field>

                <Field
                  label={tr("Pips")}
                >
                  <input
                    value={
                      form.pips
                    }
                    onChange={(
                      event
                    ) =>
                      setForm({
                        ...form,
                        pips:
                          event
                            .target
                            .value,
                      })
                    }
                    placeholder={tr("+180")}
                    className={
                      inputClass
                    }
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Field
                  label={tr("Setup")}
                >
                  <input
                    value={
                      form.setup
                    }
                    onChange={(
                      event
                    ) =>
                      setForm({
                        ...form,
                        setup:
                          event
                            .target
                            .value,
                      })
                    }
                    placeholder={tr("Fibo / SMC...")}
                    className={
                      inputClass
                    }
                  />
                </Field>

                <Field
                  label={tr("Timeframe")}
                >
                  <input
                    value={
                      form.timeframe
                    }
                    onChange={(
                      event
                    ) =>
                      setForm({
                        ...form,
                        timeframe:
                          event
                            .target
                            .value,
                      })
                    }
                    placeholder={tr("H4 / M1...")}
                    className={
                      inputClass
                    }
                  />
                </Field>

                <Field
                  label={tr("Session")}
                >
                  <select
                    value={
                      form.session
                    }
                    onChange={(
                      event
                    ) =>
                      setForm({
                        ...form,
                        session:
                          event
                            .target
                            .value,
                      })
                    }
                    className={
                      inputClass
                    }
                  >
                    <option value="">
                      —
                    </option>

                    <option value="Asian">{tr("Asian")}</option>

                    <option value="London">{tr("London")}</option>

                    <option value="New York">{tr("New York")}</option>
                  </select>
                </Field>
              </div>

              <Field
                label={tr("Commentaire")}
              >
                <textarea
                  value={
                    form.comment
                  }
                  onChange={(
                    event
                  ) =>
                    setForm({
                      ...form,
                      comment:
                        event
                          .target
                          .value,
                    })
                  }
                  placeholder={tr("Contexte du trade, TP partiel, remarque...")}
                  rows={4}
                  className={`${inputClass} resize-none py-3`}
                />
              </Field>

              <div
                className="
                  rounded-[20px]
                  border
                  border-white/[0.08]
                  bg-black/20
                  p-4
                "
              >
                <div className="flex items-start gap-3">
                  <div
                    className="
                      flex h-10 w-10 shrink-0
                      items-center justify-center
                      rounded-xl
                      border border-[color:var(--gold-border)]
                      bg-[color:var(--gold-soft)]
                      text-[color:var(--gold)]
                    "
                  >
                    <ImageIcon size={17} />
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-white">{tr("Capture TradingView")}</div>

                    <div className="mt-1 text-[10px] text-[color:var(--muted)]">{tr("Ajoute la preuve graphique du trade VIP.")}</div>
                  </div>
                </div>

                {currentScreenshotPreview ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-black">
                    <button
                      type="button"
                      onClick={() =>
                        setViewingScreenshot(
                          currentScreenshotPreview
                        )
                      }
                      className="block w-full"
                    >
                      <img
                        src={currentScreenshotPreview}
                        alt={tr("Capture TradingView VIP")}
                        className="max-h-[330px] w-full object-contain"
                      />
                    </button>

                    <div className="flex flex-col gap-3 border-t border-white/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-[10px] text-[color:var(--muted)]">
                        {screenshotFile
                          ? screenshotFile.name
                          : tr("Capture enregistrée")}
                      </div>

                      <div className="flex gap-2">
                        <label
                          className="
                            inline-flex h-9 cursor-pointer
                            items-center gap-2 rounded-xl
                            border border-[color:var(--gold-border)]
                            bg-[color:var(--gold-soft)]
                            px-3 text-[10px] font-semibold
                            text-[color:var(--gold)]
                          "
                        >
                          <Upload size={12} />{tr("Remplacer")}<input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(event) =>
                              selectScreenshot(
                                event.target.files?.[0] || null
                              )
                            }
                          />
                        </label>

                        <button
                          type="button"
                          onClick={removeScreenshotFromForm}
                          className="
                            h-9 rounded-xl
                            border border-red-500/20
                            bg-red-500/[0.05]
                            px-3 text-[10px] font-semibold
                            text-red-400
                          "
                        >{tr("Retirer")}</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label
                    onDragOver={(event) =>
                      event.preventDefault()
                    }
                    onDrop={(event) => {
                      event.preventDefault();
                      selectScreenshot(
                        event.dataTransfer.files?.[0] || null
                      );
                    }}
                    className="
                      mt-4 flex min-h-[150px]
                      cursor-pointer flex-col
                      items-center justify-center
                      rounded-2xl border border-dashed
                      border-[color:var(--gold-border)]
                      bg-[color:var(--gold-soft)]
                      px-4 text-center
                    "
                  >
                    <Upload
                      size={20}
                      className="text-[color:var(--gold)]"
                    />

                    <div className="mt-3 text-xs font-semibold text-white">{tr("Ajouter une capture")}</div>

                    <div className="mt-1 text-[10px] text-[color:var(--muted)]">{tr("Clique ou dépose l'image ici")}</div>

                    <div className="mt-1 text-[9px] text-white/25">{tr("PNG, JPG, WEBP • 5 Mo max")}</div>

                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(event) =>
                        selectScreenshot(
                          event.target.files?.[0] || null
                        )
                      }
                    />
                  </label>
                )}
              </div>

              <div
                className="
                  flex
                  flex-col-reverse
                  gap-3
                  border-t
                  border-[color:var(--border)]
                  pt-5
                  sm:flex-row
                  sm:justify-end
                "
              >
                <button
                  type="button"
                  onClick={() =>
                    setModalOpen(
                      false
                    )
                  }
                  className="
                    h-11
                    rounded-xl
                    border
                    border-white/10
                    bg-white/[0.03]
                    px-5
                    text-sm
                    font-medium
                    text-white
                  "
                >{tr("Annuler")}</button>

                <button
                  type="button"
                  onClick={
                    saveTrade
                  }
                  disabled={
                    saving
                  }
                  className="
                    h-11
                    rounded-xl
                    bg-[color:var(--gold)]
                    px-5
                    text-sm
                    font-semibold
                    text-black
                    transition
                    hover:bg-[color:var(--gold-2)]
                    disabled:opacity-50
                  "
                >
                  {saving
                    ? "Enregistrement..."
                    : editingTrade
                    ? tr("Enregistrer les modifications")
                    : tr("Ajouter le trade VIP")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {viewingScreenshot ? (
        <div
          className="
            fixed inset-0 z-[3000]
            flex items-center justify-center
            bg-black/90 p-4 backdrop-blur-md
          "
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setViewingScreenshot(null);
            }
          }}
        >
          <div
            className="
              max-h-[94vh] w-full max-w-6xl
              overflow-hidden rounded-[24px]
              border border-white/[0.08]
              bg-[#09090b]
            "
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2">
                <ImageIcon
                  size={15}
                  className="text-[color:var(--gold)]"
                />

                <span className="text-xs font-semibold text-white">{tr("Preuve graphique du trade VIP")}</span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setViewingScreenshot(null)
                }
                className="
                  flex h-9 w-9 items-center justify-center
                  rounded-xl border border-white/[0.08]
                  bg-white/[0.03] text-white/60
                "
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex max-h-[calc(94vh-62px)] items-center justify-center overflow-auto bg-black p-3">
              <img
                src={viewingScreenshot}
                alt={tr("Preuve graphique VIP")}
                className="max-h-[calc(94vh-90px)] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

const inputClass = `
  h-11
  w-full
  rounded-xl
  border
  border-white/10
  bg-black/30
  px-3
  text-sm
  text-white
  outline-none
  transition
  placeholder:text-white/20
  focus:border-[color:var(--gold-border)]
`;

function Field({
  label,
  children,
}: {
  label: string;
  children:
    React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-medium text-white/60">
        {label}
      </div>

      {children}
    </label>
  );
}

function PeriodButton({
  active,
  onClick,
  children,
}: {
  active: boolean;

  onClick: () => void;

  children:
    React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        "rounded-xl border px-3 py-2 text-xs font-medium transition",

        active
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
          : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  positive = false,
  negative = false,
}: {
  icon:
    React.ReactNode;

  label: string;

  value: string;

  sub?: string;

  positive?: boolean;

  negative?: boolean;
}) {
  return (
    <div
      className="
        rounded-[20px]
        border
        border-[color:var(--border)]
        bg-[color:var(--panel)]
        p-4
      "
    >
      <div className="flex items-start gap-3">
        <div
          className="
            flex
            h-10
            w-10
            shrink-0
            items-center
            justify-center
            rounded-xl
            border
            border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            text-[color:var(--gold)]
          "
        >
          {icon}
        </div>

        <div className="min-w-0">
          <div className="text-[10px] text-[color:var(--muted)]">
            {label}
          </div>

          <div
            className={[
              "mt-1 text-lg font-bold",

              positive
                ? "text-emerald-400"
                : negative
                ? "text-red-400"
                : "text-white",
            ].join(" ")}
          >
            {value}
          </div>

          {sub ? (
            <div className="mt-1 text-[9px] text-[color:var(--muted)]">
              {sub}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TableHead({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <th
      className="
        whitespace-nowrap
        px-5
        py-3
        text-left
        text-[10px]
        font-semibold
        uppercase
        tracking-[0.08em]
        text-white/30
      "
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <td
      className="
        whitespace-nowrap
        px-5
        py-4
        text-xs
        text-white/60
      "
    >
      {children}
    </td>
  );
}
