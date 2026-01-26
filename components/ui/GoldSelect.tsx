"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Option = {
  value: string;
  label: string;
  meta?: string;
};

export default function GoldSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Choisir…",
  searchable = true,
  disabled = false,
  className = "",
  maxMenuHeight = 320, // ✅ plus grand
}: {
  label?: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  maxMenuHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) =>
      `${o.label} ${o.value} ${o.meta ?? ""}`.toLowerCase().includes(s)
    );
  }, [q, options]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!open) return;
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  return (
    <div ref={ref} className={["w-full relative", className].join(" ")}>
      {label ? <div className="text-xs text-white/70 mb-1">{label}</div> : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={[
          "w-full h-12 px-4 rounded-2xl border transition flex items-center justify-between gap-3",
          "bg-black/45 border-[color:var(--gold-border)]",
          "hover:bg-white/5",
          "backdrop-blur-md",
          disabled ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
      >
        <div className="min-w-0 text-left">
          {selected ? (
            <div className="truncate text-white font-semibold">{selected.label}</div>
          ) : (
            <div className="truncate text-white/60">{placeholder}</div>
          )}
        </div>

        <span className="text-[color:var(--gold)]/70">{open ? "▴" : "▾"}</span>
      </button>

      {open ? (
        <div
          className="
            absolute left-0 top-full z-50 mt-2
            w-full min-w-full
            rounded-2xl
            border border-[color:var(--gold-border)]
            overflow-hidden
            shadow-[0_0_35px_rgba(214,179,95,0.16)]
            animate-[gsfade_.12s_ease-out]
          "
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(14px)",
          }}
        >
          {searchable ? (
            <div className="p-3 border-b border-white/10">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher…"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10
                           text-white placeholder:text-white/30 outline-none
                           focus:border-[color:var(--gold-border)]
                           focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
              />
            </div>
          ) : null}

          {/* ✅ Un seul scroll VERTICAL (pas horizontal) */}
          <div
            className="p-2 overflow-y-auto overflow-x-hidden"
            style={{ maxHeight: maxMenuHeight }}
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-[color:var(--muted)]">
                Aucun résultat
              </div>
            ) : (
              filtered.map((o) => {
                const active = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={[
                      "w-full text-left px-4 py-3 rounded-2xl transition",
                      active
                        ? "bg-[color:var(--gold-soft)] text-[color:var(--gold)] border border-[color:var(--gold-border)]"
                        : "text-white/90 hover:bg-white/5",
                    ].join(" ")}
                  >
                    <div className="font-semibold">{o.label}</div>
                    {o.meta ? (
                      <div className="text-[10px] text-[color:var(--muted)]">
                        {o.meta}
                      </div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
