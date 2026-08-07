"use client";

import { useEffect, useMemo, useState } from "react";
import { pushNotif } from "./notifyStore";

type MaintenanceKey = "terminal" | "copieur";

export type MaintenanceState = {
  enabled: boolean;
  endsAt: number; // ms
  message: string;
  updatedAt: number; // ms
  updatedBy: string; // pseudo admin
};

export type AdminAudit = {
  id: string;
  at: number;
  by: string;
  action: string;
  meta?: Record<string, any>;
};

const LS_MAINT = "investpro_admin_maintenance_v1";
const LS_AUDIT = "investpro_admin_audit_v1";

// ✅ état par défaut stable (pas de Date.now() à l'import)
const DEFAULT_MAINT_STATE: MaintenanceState = {
  enabled: false,
  endsAt: 0,
  message: "",
  updatedAt: 0,
  updatedBy: "Admin",
};

const defaultState: Record<MaintenanceKey, MaintenanceState> = {
  terminal: { ...DEFAULT_MAINT_STATE },
  copieur: { ...DEFAULT_MAINT_STATE },
};

function isKey(k: any): k is MaintenanceKey {
  return k === "terminal" || k === "copieur";
}

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    if (!s) return fallback;
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** ✅ Normalise la structure lue depuis LS (évite objets partiels/corrompus) */
function normalizeMaint(raw: any): Record<MaintenanceKey, MaintenanceState> {
  const now = Date.now();

  const pick = (k: MaintenanceKey): MaintenanceState => {
    const v = raw?.[k] ?? {};
    const enabled = Boolean(v.enabled);
    const endsAt = Number.isFinite(Number(v.endsAt)) ? Number(v.endsAt) : 0;
    const message = typeof v.message === "string" ? v.message : "";
    const updatedAt = Number.isFinite(Number(v.updatedAt)) ? Number(v.updatedAt) : now;
    const updatedBy = typeof v.updatedBy === "string" && v.updatedBy.trim() ? v.updatedBy : "Admin";

    return { enabled, endsAt, message, updatedAt, updatedBy };
  };

  return {
    terminal: pick("terminal"),
    copieur: pick("copieur"),
  };
}

function readMaint(): Record<MaintenanceKey, MaintenanceState> {
  if (typeof window === "undefined") return defaultState;

  const raw = safeParse<any>(localStorage.getItem(LS_MAINT), null);
  const norm = normalizeMaint(raw);

  // ✅ si storage vide/corrompu → on réécrit une version clean
  if (!raw || !raw.terminal || !raw.copieur) {
    localStorage.setItem(LS_MAINT, JSON.stringify(norm));
  }
  return norm;
}

function writeMaint(v: Record<MaintenanceKey, MaintenanceState>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_MAINT, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent("admin:maintenance"));
}

function readAudit(): AdminAudit[] {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(LS_AUDIT), [] as AdminAudit[]);
}
function writeAudit(v: AdminAudit[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_AUDIT, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent("admin:audit"));
}

function id() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function getAdminCode(): string {
  return (process.env.NEXT_PUBLIC_ADMIN_CODE || "").trim();
}

export function verifyAdminCode(code: string) {
  const real = getAdminCode();
  if (!real) return false;
  return code.trim() === real;
}

export function setMaintenance(
  key: MaintenanceKey,
  payload: { enabled: boolean; durationMin?: number; endsAt?: number; message?: string; by?: string }
) {
  const cur = readMaint();
  const by = payload.by || "Admin";
  const now = Date.now();

  const endsAt =
    payload.enabled === false
      ? 0
      : payload.endsAt
      ? payload.endsAt
      : now + Math.max(1, payload.durationMin || 60) * 60 * 1000;

  const next: Record<MaintenanceKey, MaintenanceState> = {
    ...cur,
    [key]: {
      enabled: payload.enabled,
      endsAt,
      message: payload.message || "",
      updatedAt: now,
      updatedBy: by,
    },
  };

  writeMaint(next);

  const logs = readAudit();
  logs.unshift({
    id: id(),
    at: now,
    by,
    action: payload.enabled ? `MAINTENANCE_ON_${key.toUpperCase()}` : `MAINTENANCE_OFF_${key.toUpperCase()}`,
    meta: { endsAt, message: payload.message || "" },
  });
  writeAudit(logs.slice(0, 200));

  pushNotif({
    kind: payload.enabled ? "warning" : "success",
    title: payload.enabled ? `Maintenance ${key}` : `Maintenance terminée (${key})`,
    message: payload.enabled
      ? `${payload.message || "En cours"} • Fin estimée: ${new Date(endsAt).toLocaleTimeString("fr-FR")}`
      : "Le service est de nouveau disponible.",
    ttlMs: payload.enabled ? 12000 : 8000,
  });
}

export function getMaintenance(key: MaintenanceKey): MaintenanceState {
  const cur = readMaint();
  return cur[key] ?? defaultState[key];
}

export function getAllMaintenance(): Record<MaintenanceKey, MaintenanceState> {
  return readMaint();
}

/**
 * ✅ Hook incassable :
 * - accepte un key invalide sans crash (fallback terminal)
 * - state toujours défini
 */
export function useMaintenance(key: MaintenanceKey | string) {
  const safeKey: MaintenanceKey = isKey(key) ? key : "terminal";

  const [state, setState] = useState<MaintenanceState>(() => getMaintenance(safeKey));

  useEffect(() => {
    const on = () => setState(getMaintenance(safeKey));

    window.addEventListener("admin:maintenance", on as any);
    window.addEventListener("storage", on);
    const t = window.setInterval(on, 1000);

    return () => {
      window.removeEventListener("admin:maintenance", on as any);
      window.removeEventListener("storage", on);
      window.clearInterval(t);
    };
  }, [safeKey]);

  const safe = state ?? defaultState[safeKey]; // ✅ double sécurité

  const remainingMs = Math.max(0, (safe.endsAt ?? 0) - Date.now());
  const isActive = Boolean(safe.enabled) && remainingMs > 0;

  return { state: safe, isActive, remainingMs, key: safeKey };
}

export function useAllMaintenance() {
  const [all, setAll] = useState<Record<MaintenanceKey, MaintenanceState>>(() => getAllMaintenance());

  useEffect(() => {
    const on = () => setAll(getAllMaintenance());
    window.addEventListener("admin:maintenance", on as any);
    window.addEventListener("storage", on);
    const t = window.setInterval(on, 1000);
    return () => {
      window.removeEventListener("admin:maintenance", on as any);
      window.removeEventListener("storage", on);
      window.clearInterval(t);
    };
  }, []);

  return all;
}

export function useAdminAudit() {
  const [logs, setLogs] = useState<AdminAudit[]>(() => readAudit());

  useEffect(() => {
    const on = () => setLogs(readAudit());
    window.addEventListener("admin:audit", on as any);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("admin:audit", on as any);
      window.removeEventListener("storage", on);
    };
  }, []);

  return logs;
}

/** Bandeau LED: texte global à afficher dans le header */
export function getLedBannerText(): string {
  const m = getAllMaintenance();
  const items: string[] = [];

  (["terminal", "copieur"] as MaintenanceKey[]).forEach((k) => {
    const s = m[k];
    if (s?.enabled && (s.endsAt ?? 0) > Date.now()) {
      const mins = Math.ceil(((s.endsAt ?? 0) - Date.now()) / 60000);
      items.push(`${k.toUpperCase()} EN MAINTENANCE • ~${mins} min • ${s.message || "Merci de patienter"}`);
    }
  });

  return items.join("   •   ");
}
