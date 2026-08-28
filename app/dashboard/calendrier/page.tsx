"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Clock3,
  Globe2,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";

import GoldSelect from "../../../components/ui/GoldSelect";
import { pushNotif } from "../../../lib/notifyStore";

type Stars = 1 | 2 | 3;
type StarsFilter = "ALL" | "23" | Stars;

type CurrencyFilter =
  | "ALL"
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "CNY";

type EconEvent = {
  id: string;
  dateParisYMD: string;
  time: string;
  currency: string;
  countryLabel: string;
  title: string;
  actual?: string;
  forecast?: string;
  previous?: string;
  stars: Stars;
};

const ALLOWED = new Set([
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
]);

const FLAG: Record<string, string> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  CNY: "🇨🇳",
};

/* =========================================================
   DATES
========================================================= */

function todayParisYMD() {
  const now = new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Europe/Paris",

        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(now);

  const get = (
    type: string
  ) =>
    parts.find(
      (part) =>
        part.type === type
    )?.value ?? "";

  return `${get(
    "year"
  )}-${get(
    "month"
  )}-${get("day")}`;
}

function addDaysYMD(
  ymd: string,
  add: number
) {
  const [year, month, day] =
    ymd
      .split("-")
      .map(Number);

  const base =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        12
      )
    );

  base.setUTCDate(
    base.getUTCDate() +
      add
  );

  return `${base.getUTCFullYear()}-${String(
    base.getUTCMonth() + 1
  ).padStart(
    2,
    "0"
  )}-${String(
    base.getUTCDate()
  ).padStart(2, "0")}`;
}

function startOfWeekMonday(
  ymd: string
) {
  const [year, month, day] =
    ymd
      .split("-")
      .map(Number);

  const base =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        12
      )
    );

  const dayOfWeek =
    base.getUTCDay();

  const mondayOffset =
    (dayOfWeek + 6) % 7;

  base.setUTCDate(
    base.getUTCDate() -
      mondayOffset
  );

  return `${base.getUTCFullYear()}-${String(
    base.getUTCMonth() + 1
  ).padStart(
    2,
    "0"
  )}-${String(
    base.getUTCDate()
  ).padStart(2, "0")}`;
}

function formatDayHeaderFR(
  ymd: string
) {
  const [year, month, day] =
    ymd
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        12
      )
    );

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      timeZone:
        "Europe/Paris",

      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }
  ).format(date);
}

/* =========================================================
   PARSING INVESTING
========================================================= */

function normalizeCurrency(
  raw: string
): {
  currency: string;
  label: string;
} | null {
  const value =
    (raw || "").trim();

  if (!value) {
    return null;
  }

  if (
    ALLOWED.has(value)
  ) {
    return {
      currency: value,

      label:
        value === "USD"
          ? "États-Unis"
          : value === "EUR"
          ? "Zone Euro"
          : value === "GBP"
          ? "Royaume-Uni"
          : value === "JPY"
          ? "Japon"
          : "Chine",
    };
  }

  const upper =
    value.toUpperCase();

  if (
    upper.includes(
      "UNITED STATES"
    ) ||
    upper.includes("U.S") ||
    upper === "US"
  ) {
    return {
      currency: "USD",
      label:
        "États-Unis",
    };
  }

  if (
    upper.includes(
      "EURO"
    ) ||
    upper.includes(
      "EUROZONE"
    ) ||
    upper.includes(
      "GERMANY"
    ) ||
    upper.includes(
      "FRANCE"
    )
  ) {
    return {
      currency: "EUR",
      label:
        "Zone Euro",
    };
  }

  if (
    upper.includes(
      "UNITED KINGDOM"
    ) ||
    upper.includes("UK") ||
    upper.includes(
      "BRITAIN"
    )
  ) {
    return {
      currency: "GBP",
      label:
        "Royaume-Uni",
    };
  }

  if (
    upper.includes("JAPAN")
  ) {
    return {
      currency: "JPY",
      label: "Japon",
    };
  }

  if (
    upper.includes("CHINA")
  ) {
    return {
      currency: "CNY",
      label: "Chine",
    };
  }

  return null;
}

function parseInvestingHtml(
  html: string,
  startYMD: string
): EconEvent[] {
  if (!html?.trim()) {
    return [];
  }

  const doc =
    new DOMParser().parseFromString(
      `<table><tbody>${html}</tbody></table>`,
      "text/html"
    );

  const rows =
    Array.from(
      doc.querySelectorAll(
        "tr"
      )
    );

  let currentDay =
    startYMD;

  const output: EconEvent[] =
    [];

  for (const row of rows) {
    const rowText =
      (
        row.textContent ||
        ""
      ).trim();

    const hasEvent =
      !!row.querySelector(
        ".event"
      ) ||
      !!row.querySelector(
        "td.event"
      );

    if (
      !hasEvent &&
      rowText.length > 8 &&
      /20\d{2}/.test(
        rowText
      ) &&
      /(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)/i.test(
        rowText
      )
    ) {
      const date =
        new Date(
          rowText
        );

      if (
        !Number.isNaN(
          date.getTime()
        )
      ) {
        const parts =
          new Intl.DateTimeFormat(
            "en-CA",
            {
              timeZone:
                "Europe/Paris",

              year:
                "numeric",
              month:
                "2-digit",
              day: "2-digit",
            }
          ).formatToParts(
            date
          );

        const get = (
          type: string
        ) =>
          parts.find(
            (part) =>
              part.type ===
              type
          )?.value ?? "";

        currentDay = `${get(
          "year"
        )}-${get(
          "month"
        )}-${get(
          "day"
        )}`;
      }

      continue;
    }

    const title =
      (
        row.querySelector(
          ".event"
        )?.textContent ||
        row.querySelector(
          "td.event"
        )?.textContent ||
        row.querySelector(
          ".event a"
        )?.textContent ||
        ""
      ).trim();

    if (!title) {
      continue;
    }

    const time =
      (
        row.querySelector(
          ".time"
        )?.textContent ||
        row.querySelector(
          "td.time"
        )?.textContent ||
        ""
      ).trim() || "—";

    const rawCurrency =
      (
        row.querySelector(
          ".flagCur"
        )?.textContent ||
        ""
      ).trim();

    const currency =
      normalizeCurrency(
        rawCurrency
      ) ||
      normalizeCurrency(
        rowText
      );

    if (!currency) {
      continue;
    }

    if (
      !ALLOWED.has(
        currency.currency
      )
    ) {
      continue;
    }

    const actual =
      (
        row.querySelector(
          ".act"
        )?.textContent ||
        ""
      ).trim() ||
      undefined;

    const forecast =
      (
        row.querySelector(
          ".fore"
        )?.textContent ||
        ""
      ).trim() ||
      undefined;

    const previous =
      (
        row.querySelector(
          ".prev"
        )?.textContent ||
        ""
      ).trim() ||
      undefined;

    const sentiment =
      row.querySelector(
        ".sentiment"
      );

    let bulls =
      row.querySelectorAll(
        ".fullBullishIcon"
      ).length +
      row.querySelectorAll(
        ".grayFullBullishIcon"
      ).length +
      row.querySelectorAll(
        ".bullishIcon"
      ).length;

    if (
      bulls === 0 &&
      sentiment
    ) {
      bulls = Math.max(
        sentiment.querySelectorAll(
          "i"
        ).length,

        sentiment.querySelectorAll(
          "svg"
        ).length
      );
    }

    bulls = Math.max(
      0,
      Math.min(
        3,
        bulls
      )
    );

    const stars: Stars =
      bulls >= 3
        ? 3
        : bulls === 2
        ? 2
        : 1;

    const id =
      row.getAttribute(
        "data-event-id"
      ) ||
      row.getAttribute(
        "event_attr_id"
      ) ||
      row.getAttribute(
        "id"
      ) ||
      `evt_${Date.now()}_${Math.random()
        .toString(16)
        .slice(2)}`;

    output.push({
      id,

      dateParisYMD:
        currentDay,

      time,

      currency:
        currency.currency,

      countryLabel:
        currency.label,

      title,

      actual,

      forecast,

      previous,

      stars,
    });
  }

  return output;
}

/* =========================================================
   HELPERS
========================================================= */

function impactLabel(
  stars: Stars
) {
  if (stars === 3) {
    return "Élevé";
  }

  if (stars === 2) {
    return "Moyen";
  }

  return "Faible";
}

function ImpactBadge({
  stars,
}: {
  stars: Stars;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1 text-[9px] font-semibold",

        stars === 3
          ? "border-red-500/20 bg-red-500/10 text-red-400"
          : stars === 2
          ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
          : "border-white/10 bg-white/5 text-white/45",
      ].join(" ")}
    >
      {impactLabel(
        stars
      )}
    </span>
  );
}

function SegmentedButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-10 rounded-xl border px-4 text-xs font-semibold transition",

        active
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
          : "border-[color:var(--border)] bg-black/20 text-white/55 hover:bg-white/[0.04] hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function eventTimestamp(
  event: EconEvent
) {
  if (
    !/^\d{2}:\d{2}$/.test(
      event.time
    )
  ) {
    return 0;
  }

  return new Date(
    `${event.dateParisYMD}T${event.time}:00`
  ).getTime();
}

/* =========================================================
   PAGE
========================================================= */

export default function CalendrierPage() {
  const today =
    useMemo(
      () =>
        todayParisYMD(),
      []
    );

  const tomorrow =
    useMemo(
      () =>
        addDaysYMD(
          today,
          1
        ),
      [today]
    );

  const [
    mode,
    setMode,
  ] = useState<
    | "day"
    | "tomorrow"
    | "week"
  >("day");

  const [
    baseDate,
    setBaseDate,
  ] = useState(today);

  const start =
    useMemo(() => {
      if (
        mode === "week"
      ) {
        return startOfWeekMonday(
          baseDate
        );
      }

      if (
        mode ===
        "tomorrow"
      ) {
        return tomorrow;
      }

      return baseDate;
    }, [
      mode,
      baseDate,
      tomorrow,
    ]);

  const end =
    useMemo(
      () =>
        mode === "week"
          ? addDaysYMD(
              start,
              6
            )
          : start,
      [mode, start]
    );

  const [
    starsFilter,
    setStarsFilter,
  ] =
    useState<StarsFilter>(
      "ALL"
    );

  const [
    currencyFilter,
    setCurrencyFilter,
  ] =
    useState<CurrencyFilter>(
      "ALL"
    );

  const [query, setQuery] =
    useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    events,
    setEvents,
  ] =
    useState<EconEvent[]>(
      []
    );

  async function loadCalendar() {
    setLoading(true);

    try {
      const url =
        new URL(
          "/api/calendar",
          window.location.origin
        );

      url.searchParams.set(
        "start",
        start
      );

      url.searchParams.set(
        "end",
        end
      );

      const response =
        await fetch(
          url.toString(),
          {
            cache:
              "no-store",
          }
        );

      const json =
        await response.json();

      if (!json?.ok) {
        setEvents([]);

        pushNotif({
          kind: "warning",
          title:
            "Calendrier",
          message:
            "La source du calendrier est momentanément indisponible.",
          ttlMs: 10000,
        });

        return;
      }

      const parsed =
        parseInvestingHtml(
          String(
            json.html ?? ""
          ),
          start
        );

      setEvents(
        parsed
      );
    } catch (error) {
      console.error(
        "Erreur calendrier :",
        error
      );

      setEvents([]);

      pushNotif({
        kind: "error",
        title:
          "Calendrier",
        message:
          "Impossible de charger le calendrier économique.",
        ttlMs: 10000,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCalendar();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  /* =====================================================
     FILTERS
  ===================================================== */

  const filtered =
    useMemo(() => {
      const search =
        query
          .trim()
          .toLowerCase();

      return events
        .filter(
          (event) => {
            if (
              starsFilter ===
              "ALL"
            ) {
              return true;
            }

            if (
              starsFilter ===
              "23"
            ) {
              return (
                event.stars >=
                2
              );
            }

            return (
              event.stars ===
              starsFilter
            );
          }
        )
        .filter(
          (event) =>
            currencyFilter ===
              "ALL" ||
            event.currency ===
              currencyFilter
        )
        .filter(
          (event) => {
            if (!search) {
              return true;
            }

            return `${event.title} ${event.currency} ${event.countryLabel}`
              .toLowerCase()
              .includes(
                search
              );
          }
        );
    }, [
      events,
      starsFilter,
      currencyFilter,
      query,
    ]);

  /* =====================================================
     STATS
  ===================================================== */

  const stats =
    useMemo(() => {
      return {
        total:
          filtered.length,

        high:
          filtered.filter(
            (event) =>
              event.stars ===
              3
          ).length,

        medium:
          filtered.filter(
            (event) =>
              event.stars ===
              2
          ).length,

        low:
          filtered.filter(
            (event) =>
              event.stars ===
              1
          ).length,
      };
    }, [filtered]);

  /* =====================================================
     GROUP
  ===================================================== */

  const grouped =
    useMemo(() => {
      const map =
        new Map<
          string,
          EconEvent[]
        >();

      for (
        const event of
          filtered
      ) {
        if (
          !map.has(
            event.dateParisYMD
          )
        ) {
          map.set(
            event.dateParisYMD,
            []
          );
        }

        map
          .get(
            event.dateParisYMD
          )!
          .push(event);
      }

      const groups =
        Array.from(
          map.entries()
        ).sort(
          (a, b) =>
            a[0].localeCompare(
              b[0]
            )
        );

      for (
        const [, list] of
          groups
      ) {
        list.sort(
          (a, b) =>
            a.time.localeCompare(
              b.time
            )
        );
      }

      return groups;
    }, [filtered]);

  /* =====================================================
     NEXT IMPORTANT EVENT
  ===================================================== */

  const nextImportant =
    useMemo(() => {
      const now =
        Date.now();

      return events
        .filter(
          (event) =>
            event.stars ===
              3 &&
            eventTimestamp(
              event
            ) > now
        )
        .sort(
          (a, b) =>
            eventTimestamp(
              a
            ) -
            eventTimestamp(
              b
            )
        )[0];
    }, [events]);

  return (
    <div className="space-y-5 pb-10">
      {/* =================================================
          HEADER
      ================================================= */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Calendrier{" "}
            <span className="text-[color:var(--gold)]">
              économique
            </span>
          </h1>

          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Suis les annonces
            macroéconomiques qui
            peuvent impacter les
            marchés.
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={
            loadCalendar
          }
          className="
            inline-flex
            h-10
            items-center gap-2
            rounded-xl
            border border-[color:var(--border)]
            bg-[color:var(--panel)]
            px-4
            text-xs
            text-white/70
            transition
            hover:bg-white/[0.04]
            hover:text-white
            disabled:opacity-50
          "
        >
          <RefreshCw
            size={14}
            className={
              loading
                ? "animate-spin"
                : ""
            }
          />

          {loading
            ? "Actualisation..."
            : "Actualiser"}
        </button>
      </div>

      {/* =================================================
          NEXT NEWS
      ================================================= */}

      <section
        className="
          relative
          overflow-hidden
          rounded-[22px]
          border border-[color:var(--gold-border)]
          bg-[color:var(--panel)]
          p-5
        "
      >
        <div
          className="
            pointer-events-none
            absolute
            right-[-120px]
            top-[-150px]
            h-[320px]
            w-[380px]
            rounded-full
            bg-[color:var(--gold)]
            opacity-[0.06]
            blur-[90px]
          "
        />

        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-[color:var(--gold)]">
              <AlertTriangle
                size={14}
              />

              PROCHAINE NEWS
              IMPORTANTE
            </div>

            {nextImportant ? (
              <>
                <h2 className="mt-3 text-xl font-semibold text-white">
                  {
                    nextImportant.title
                  }
                </h2>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[color:var(--muted)]">
                  <span>
                    {
                      FLAG[
                        nextImportant
                          .currency
                      ]
                    }{" "}
                    {
                      nextImportant.currency
                    }
                  </span>

                  <span>
                    {
                      nextImportant
                        .countryLabel
                    }
                  </span>

                  <span>
                    {
                      nextImportant
                        .dateParisYMD
                    }
                  </span>

                  <span className="flex items-center gap-1">
                    <Clock3
                      size={12}
                    />

                    {
                      nextImportant.time
                    }
                  </span>
                </div>
              </>
            ) : (
              <>
                <h2 className="mt-3 text-lg font-semibold text-white">
                  Aucune news majeure
                  détectée
                </h2>

                <p className="mt-2 text-xs text-[color:var(--muted)]">
                  Aucune annonce 3
                  étoiles à venir dans
                  la plage chargée.
                </p>
              </>
            )}
          </div>

          {nextImportant ? (
            <div className="flex items-center gap-5">
              <DataValue
                label="Précédent"
                value={
                  nextImportant.previous ??
                  "—"
                }
              />

              <DataValue
                label="Prévision"
                value={
                  nextImportant.forecast ??
                  "—"
                }
              />

              <ImpactBadge
                stars={3}
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* =================================================
          PERIOD
      ================================================= */}

      <section
        className="
          rounded-[22px]
          border border-[color:var(--border)]
          bg-[color:var(--panel)]
          p-4
        "
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          {/* PERIOD */}

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-white/35">
              Période
            </div>

            <div className="flex flex-wrap gap-2">
              <SegmentedButton
                active={
                  mode ===
                  "day"
                }
                onClick={() => {
                  setBaseDate(
                    today
                  );
                  setMode(
                    "day"
                  );
                }}
              >
                Aujourd’hui
              </SegmentedButton>

              <SegmentedButton
                active={
                  mode ===
                  "tomorrow"
                }
                onClick={() =>
                  setMode(
                    "tomorrow"
                  )
                }
              >
                Demain
              </SegmentedButton>

              <SegmentedButton
                active={
                  mode ===
                  "week"
                }
                onClick={() =>
                  setMode(
                    "week"
                  )
                }
              >
                Cette semaine
              </SegmentedButton>
            </div>
          </div>

          {/* IMPACT */}

          <div className="xl:w-[190px]">
            <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-white/35">
              Impact
            </div>

            <GoldSelect
              value={
                starsFilter ===
                "ALL"
                  ? "ALL"
                  : String(
                      starsFilter
                    )
              }
              onChange={(
                value: string
              ) => {
                if (
                  value ===
                  "ALL"
                ) {
                  setStarsFilter(
                    "ALL"
                  );

                  return;
                }

                if (
                  value ===
                  "23"
                ) {
                  setStarsFilter(
                    "23"
                  );

                  return;
                }

                setStarsFilter(
                  Number(
                    value
                  ) as Stars
                );
              }}
              options={[
                {
                  value:
                    "ALL",
                  label:
                    "Tous les impacts",
                },

                {
                  value:
                    "23",
                  label:
                    "Moyen + Élevé",
                },

                {
                  value: "3",
                  label:
                    "Élevé",
                },

                {
                  value: "2",
                  label:
                    "Moyen",
                },

                {
                  value: "1",
                  label:
                    "Faible",
                },
              ]}
              className="w-full"
            />
          </div>

          {/* CURRENCY */}

          <div className="xl:w-[180px]">
            <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-white/35">
              Devise
            </div>

            <select
              value={
                currencyFilter
              }
              onChange={(
                event
              ) =>
                setCurrencyFilter(
                  event.target
                    .value as CurrencyFilter
                )
              }
              className="
                h-11
                w-full
                rounded-xl
                border border-[color:var(--border)]
                bg-black/20
                px-4
                text-sm
                text-white
                outline-none
                focus:border-[color:var(--gold-border)]
              "
            >
              <option value="ALL">
                Toutes
              </option>

              <option value="USD">
                🇺🇸 USD
              </option>

              <option value="EUR">
                🇪🇺 EUR
              </option>

              <option value="GBP">
                🇬🇧 GBP
              </option>

              <option value="JPY">
                🇯🇵 JPY
              </option>

              <option value="CNY">
                🇨🇳 CNY
              </option>
            </select>
          </div>

          {/* SEARCH */}

          <div className="relative flex-1">
            <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-white/35">
              Recherche
            </div>

            <Search
              size={15}
              className="
                absolute
                bottom-[13px]
                left-4
                text-white/25
              "
            />

            <input
              value={
                query
              }
              onChange={(
                event
              ) =>
                setQuery(
                  event.target
                    .value
                )
              }
              placeholder="NFP, CPI, taux d’intérêt..."
              className="
                h-11
                w-full
                rounded-xl
                border border-[color:var(--border)]
                bg-black/20
                pl-10 pr-4
                text-sm
                text-white
                outline-none
                placeholder:text-white/25
                focus:border-[color:var(--gold-border)]
              "
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-3 text-[10px] text-[color:var(--muted)]">
          <CalendarDays
            size={12}
          />

          <span>
            {start}
          </span>

          <ChevronRight
            size={11}
          />

          <span>
            {end}
          </span>

          <span className="ml-auto">
            Heure affichée :
            Paris
          </span>
        </div>
      </section>

      {/* =================================================
          STATS
      ================================================= */}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Événements"
          value={
            stats.total
          }
          icon={
            <Globe2
              size={17}
            />
          }
        />

        <StatCard
          label="Impact élevé"
          value={
            stats.high
          }
          icon={
            <AlertTriangle
              size={17}
            />
          }
          tone="danger"
        />

        <StatCard
          label="Impact moyen"
          value={
            stats.medium
          }
          icon={
            <TrendingUp
              size={17}
            />
          }
          tone="warning"
        />

        <StatCard
          label="Impact faible"
          value={
            stats.low
          }
          icon={
            <CalendarDays
              size={17}
            />
          }
        />
      </section>

      {/* =================================================
          EVENTS
      ================================================= */}

      <section
        className="
          overflow-hidden
          rounded-[22px]
          border border-[color:var(--border)]
          bg-[color:var(--panel)]
        "
      >
        <div
          className="
            flex items-center
            justify-between
            border-b border-[color:var(--border)]
            px-5 py-4
          "
        >
          <div>
            <h2 className="text-sm font-semibold text-white">
              Événements
              économiques
            </h2>

            <p className="mt-1 text-[10px] text-[color:var(--muted)]">
              {
                filtered.length
              }{" "}
              événement
              {filtered.length !==
              1
                ? "s"
                : ""}
            </p>
          </div>

          {loading ? (
            <RefreshCw
              size={15}
              className="animate-spin text-[color:var(--gold)]"
            />
          ) : null}
        </div>

        {grouped.length ===
        0 ? (
          <div className="py-16 text-center">
            <div
              className="
                mx-auto
                flex h-14 w-14
                items-center
                justify-center
                rounded-2xl
                border border-[color:var(--gold-border)]
                bg-[color:var(--gold-soft)]
              "
            >
              <CalendarDays
                size={22}
                className="text-[color:var(--gold)]"
              />
            </div>

            <div className="mt-4 text-sm font-semibold text-white">
              {loading
                ? "Chargement du calendrier..."
                : "Aucun événement"}
            </div>

            {!loading ? (
              <p className="mt-2 text-xs text-[color:var(--muted)]">
                Modifie les
                filtres ou
                actualise le
                calendrier.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {grouped.map(
              ([
                day,
                list,
              ]) => (
                <div
                  key={day}
                  className="
                    overflow-hidden
                    rounded-2xl
                    border border-white/[0.06]
                    bg-black/15
                  "
                >
                  {/* DAY HEADER */}

                  <div
                    className="
                      flex items-center
                      justify-between
                      border-b border-white/[0.06]
                      bg-black/20
                      px-5 py-3
                    "
                  >
                    <div className="flex items-center gap-2">
                      <CalendarDays
                        size={14}
                        className="text-[color:var(--gold)]"
                      />

                      <span className="text-xs font-semibold capitalize text-white">
                        {formatDayHeaderFR(
                          day
                        )}
                      </span>
                    </div>

                    <span className="text-[10px] text-[color:var(--muted)]">
                      {
                        list.length
                      }{" "}
                      annonce
                      {list.length !==
                      1
                        ? "s"
                        : ""}
                    </span>
                  </div>

                  {/* DESKTOP HEAD */}

                  <div
                    className="
                      hidden
                      border-b border-white/[0.05]
                      px-5 py-2
                      text-[9px]
                      uppercase
                      tracking-wider
                      text-white/30
                      lg:grid
                      lg:grid-cols-12
                      lg:gap-4
                    "
                  >
                    <div className="lg:col-span-1">
                      Heure
                    </div>

                    <div className="lg:col-span-1">
                      Devise
                    </div>

                    <div className="lg:col-span-1">
                      Impact
                    </div>

                    <div className="lg:col-span-5">
                      Événement
                    </div>

                    <div className="text-right lg:col-span-1">
                      Préc.
                    </div>

                    <div className="text-right lg:col-span-1">
                      Prévision
                    </div>

                    <div className="text-right lg:col-span-2">
                      Réel
                    </div>
                  </div>

                  {/* EVENT ROWS */}

                  <div className="divide-y divide-white/[0.05]">
                    {list.map(
                      (event) => (
                        <div
                          key={
                            event.id
                          }
                          className="
                            grid
                            grid-cols-1
                            gap-3
                            px-5 py-4
                            transition
                            hover:bg-white/[0.02]
                            lg:grid-cols-12
                            lg:items-center
                            lg:gap-4
                          "
                        >
                          {/* TIME */}

                          <div className="lg:col-span-1">
                            <div className="text-sm font-semibold text-white">
                              {
                                event.time
                              }
                            </div>
                          </div>

                          {/* CURRENCY */}

                          <div className="lg:col-span-1">
                            <div className="flex items-center gap-2">
                              <span>
                                {
                                  FLAG[
                                    event
                                      .currency
                                  ]
                                }
                              </span>

                              <span className="text-xs font-semibold text-white">
                                {
                                  event.currency
                                }
                              </span>
                            </div>
                          </div>

                          {/* IMPACT */}

                          <div className="lg:col-span-1">
                            <ImpactBadge
                              stars={
                                event.stars
                              }
                            />
                          </div>

                          {/* EVENT */}

                          <div className="min-w-0 lg:col-span-5">
                            <div className="text-sm font-semibold text-white">
                              {
                                event.title
                              }
                            </div>

                            <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                              {
                                event.countryLabel
                              }
                            </div>
                          </div>

                          {/* PREVIOUS */}

                          <DataCell
                            label="Précédent"
                            value={
                              event.previous ??
                              "—"
                            }
                          />

                          {/* FORECAST */}

                          <DataCell
                            label="Prévision"
                            value={
                              event.forecast ??
                              "—"
                            }
                          />

                          {/* ACTUAL */}

                          <div className="lg:col-span-2 lg:text-right">
                            <div className="text-[9px] text-white/30 lg:hidden">
                              Réel
                            </div>

                            <div className="text-sm font-semibold text-[color:var(--gold)]">
                              {
                                event.actual ??
                                "—"
                              }
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function StatCard({
  label,
  value,
  icon,
  tone = "normal",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?:
    | "normal"
    | "warning"
    | "danger";
}) {
  return (
    <div
      className="
        rounded-2xl
        border border-[color:var(--border)]
        bg-[color:var(--panel)]
        p-4
      "
    >
      <div className="flex items-center gap-3">
        <div
          className={[
            "flex h-10 w-10 items-center justify-center rounded-xl border",

            tone ===
            "danger"
              ? "border-red-500/20 bg-red-500/10 text-red-400"
              : tone ===
                "warning"
              ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
              : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
          ].join(" ")}
        >
          {icon}
        </div>

        <div>
          <div className="text-[10px] text-[color:var(--muted)]">
            {label}
          </div>

          <div className="mt-1 text-xl font-semibold text-white">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function DataValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[9px] text-white/30">
        {label}
      </div>

      <div className="mt-1 text-sm font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

function DataCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="lg:col-span-1 lg:text-right">
      <div className="text-[9px] text-white/30 lg:hidden">
        {label}
      </div>

      <div className="text-xs font-medium text-white/75">
        {value}
      </div>
    </div>
  );
}