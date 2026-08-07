"use client";

import { useEffect, useState } from "react";
import { pushNotif } from "./notifyStore";

/** =========================
 *  Admin Session (local)
 *  ========================= */
const LS_ADMIN_SESSION = "investpro_admin_session_v1";
const EVT_ADMIN_SESSION = "investpro:admin_session";

export function getAdminCode(): string {
  return (process.env.NEXT_PUBLIC_ADMIN_CODE || "").trim();
}

export function verifyAdminCode(code: string) {
  const real = getAdminCode();
  if (!real) return false;
  return code.trim() === real;
}

export function isAdminNow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(LS_ADMIN_SESSION);
    if (!raw) return false;
    const j = JSON.parse(raw);
    return j?.active === true;
  } catch {
    return false;
  }
}

export function grantAdminSession(by = "Admin") {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    LS_ADMIN_SESSION,
    JSON.stringify({ active: true, by, at: Date.now() })
  );
  window.dispatchEvent(new CustomEvent(EVT_ADMIN_SESSION, { detail: { active: true } }));
}

export function revokeAdminSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_ADMIN_SESSION);
  window.dispatchEvent(new CustomEvent(EVT_ADMIN_SESSION, { detail: { active: false } }));
}

export function useAdminSession() {
  const [active, setActive] = useState<boolean>(() => isAdminNow());

  useEffect(() => {
    const on = () => setActive(isAdminNow());
    window.addEventListener(EVT_ADMIN_SESSION, on as any);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT_ADMIN_SESSION, on as any);
      window.removeEventListener("storage", on);
    };
  }, []);

  return active;
}

/** =========================
 *  Maintenance (Terminal/Copieur)
 *  ========================= */
export type MaintenanceKey = "terminal" | "copieur";

export type MaintenanceState = {
  enabled: boolean;
  endsAt: number; // ms
  message: string;
  updatedAt: number; // ms
  updatedBy: string;
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

const EVT_ADMIN_STATUS_UPDATED = "investpro:admin_status_updated";
const EVT_ADMIN_AUDIT = "admin:audit";

const defaultState: Record<MaintenanceKey, MaintenanceState> = {
  terminal: { enabled: false, endsAt: 0, message: "", updatedAt: Date.now(), updatedBy: "Admin" },
  copieur: { enabled: false, endsAt: 0, message: "", updatedAt: Date.now(), updatedBy: "Admin" },
};

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    if (!s) return fallback;
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function readMaint(): Record<MaintenanceKey, MaintenanceState> {
  if (typeof window === "undefined") return defaultState;
  return safeParse(localStorage.getItem(LS_MAINT), defaultState);
}

function writeMaint(v: Record<MaintenanceKey, MaintenanceState>) {
  localStorage.setItem(LS_MAINT, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent(EVT_ADMIN_STATUS_UPDATED, { detail: getAdminStatus() }));
}

function readAudit(): AdminAudit[] {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(LS_AUDIT), [] as AdminAudit[]);
}

function writeAudit(v: AdminAudit[]) {
  localStorage.setItem(LS_AUDIT, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent(EVT_ADMIN_AUDIT));
}

function id() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
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

export function getAllMaintenance(): Record<MaintenanceKey, MaintenanceState> {
  return readMaint();
}

export function getAdminStatus() {
  const m = getAllMaintenance();
  return {
    maintTerminal: !!(m.terminal.enabled && m.terminal.endsAt > Date.now()),
    maintCopieur: !!(m.copieur.enabled && m.copieur.endsAt > Date.now()),
    terminal: m.terminal,
    copieur: m.copieur,
  };
}

export function useAdminStatus() {
  const [s, setS] = useState(() => getAdminStatus());

  useEffect(() => {
    const on = () => setS(getAdminStatus());
    window.addEventListener(EVT_ADMIN_STATUS_UPDATED, on as any);
    window.addEventListener("storage", on);
    const t = setInterval(on, 1000);
    return () => {
      window.removeEventListener(EVT_ADMIN_STATUS_UPDATED, on as any);
      window.removeEventListener("storage", on);
      clearInterval(t);
    };
  }, []);

  return s;
}

export function useAdminAudit() {
  const [logs, setLogs] = useState<AdminAudit[]>(() => readAudit());

  useEffect(() => {
    const on = () => setLogs(readAudit());
    window.addEventListener(EVT_ADMIN_AUDIT, on as any);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT_ADMIN_AUDIT, on as any);
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
    if (s.enabled && s.endsAt > Date.now()) {
      const mins = Math.ceil((s.endsAt - Date.now()) / 60000);
      items.push(`${k.toUpperCase()} EN MAINTENANCE • ~${mins} min • ${s.message || "Merci de patienter"}`);
    }
  });

  return items.join("   •   ");
}
