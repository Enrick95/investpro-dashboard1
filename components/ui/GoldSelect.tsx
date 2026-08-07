"use client";

import React, { useMemo } from "react";

export type GoldSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  onChange: (value: string) => void;

  /** compat: certains écrans utilisent items, d'autres options */
  items?: GoldSelectOption[];
  options?: GoldSelectOption[];

  placeholder?: string;
  className?: string;
};

export default function GoldSelect({
  value,
  onChange,
  items,
  options,
  placeholder = "Sélectionner…",
  className = "",
}: Props) {
  const list = (items ?? options ?? []) as GoldSelectOption[];

  const selected = useMemo(() => {
    if (!Array.isArray(list) || list.length === 0) return null;
    return list.find((o) => o.value === value) ?? null;
  }, [list, value]);

  return (
    <div className={`relative ${className}`}>
      <select
        value={selected?.value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={[
          "w-full rounded-xl border border-gold-soft bg-panel px-3 py-2",
          "text-sm outline-none",
          "focus:ring-2 focus:ring-gold/30",
        ].join(" ")}
      >
        {/* Placeholder si aucune valeur */}
        {!selected && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}

        {(list ?? []).map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
