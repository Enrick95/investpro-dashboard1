import type { SthStatus } from "@/lib/sth/client";

export type NetworkReceiver = {
  id: string;
  alias: string;
  platform: string;
  login: string;
  server: string;
};

export type NetworkMaster = {
  id: string;
  name: string;
  login?: string;
  platform?: string;
  server?: string;
  approved?: boolean;
};

export type ConnectionSnapshot = {
  status: SthStatus;
  checkedAt: number;
};

export type ConnectionState = {
  snapshot?: ConnectionSnapshot;
  checking?: boolean;
  error?: boolean;
};

export type ConnectionStateLabel = {
  kind: "connected" | "disconnected" | "checking" | "unknown" | "error" | "stale";
  labelFrench: string;
  tone: "green" | "amber" | "neutral";
};

export const CONNECTION_FRESHNESS_MS = 2 * 60 * 1000;

/** Provider confirmations are scoped to a receiver by the caller, never to drafts. */
export function connectionStateLabel(
  state: ConnectionState | undefined,
  now = Date.now(),
): ConnectionStateLabel {
  if (state?.checking) {
    return { kind: "checking", labelFrench: "Vérification en cours", tone: "neutral" };
  }
  if (state?.error) {
    return { kind: "error", labelFrench: "Vérification indisponible", tone: "amber" };
  }

  const snapshot = state?.snapshot;
  if (
    !snapshot ||
    !Number.isFinite(now) ||
    !Number.isFinite(snapshot.checkedAt) ||
    snapshot.checkedAt > now ||
    typeof snapshot.status?.isTradingAccountConnected !== "boolean"
  ) {
    return { kind: "unknown", labelFrench: "Connexion à vérifier", tone: "neutral" };
  }
  if (now - snapshot.checkedAt > CONNECTION_FRESHNESS_MS) {
    return { kind: "stale", labelFrench: "À revérifier", tone: "amber" };
  }
  return snapshot.status.isTradingAccountConnected
    ? { kind: "connected", labelFrench: "Connecté", tone: "green" }
    : { kind: "disconnected", labelFrench: "Déconnecté", tone: "amber" };
}

/** A stale snapshot still records a saved link, but cannot confirm live connectivity. */
export function persistedLinkedMasterIds(state: ConnectionState | undefined): string[] {
  const masters = state?.snapshot?.status?.masterAccountsList;
  if (!Array.isArray(masters)) return [];
  return Array.from(new Set(masters
    .filter((master) => master.userIsSubscribed === true && typeof master.id === "string" && master.id.length > 0)
    .map((master) => master.id)));
}

/** Sources from approval metadata, supplemented only by actual saved subscriptions. */
export function networkMasters(
  approvedMasters: readonly NetworkMaster[],
  states: Readonly<Record<string, ConnectionState>>,
): NetworkMaster[] {
  const masters = new Map<string, NetworkMaster>();
  for (const master of approvedMasters) {
    if (master.id && !masters.has(master.id)) masters.set(master.id, { ...master });
  }
  for (const state of Object.values(states)) {
    const snapshotMasters = state.snapshot?.status?.masterAccountsList;
    if (!Array.isArray(snapshotMasters)) continue;
    for (const master of snapshotMasters) {
      if (
        master.userIsSubscribed === true &&
        typeof master.id === "string" && master.id.length > 0 &&
        !masters.has(master.id)
      ) {
        masters.set(master.id, { id: master.id, name: master.name });
      }
    }
  }
  return Array.from(masters.values());
}

export function linkStateLabel(
  state: ConnectionState | undefined,
  masterId: string,
  now = Date.now(),
): ConnectionStateLabel {
  const connection = connectionStateLabel(state, now);
  if (!persistedLinkedMasterIds(state).includes(masterId)) {
    return { kind: "unknown", labelFrench: "Liaison à configurer", tone: "neutral" };
  }
  if (connection.kind === "connected") {
    return { kind: "connected", labelFrench: "Relié au Master", tone: "green" };
  }
  if (connection.kind === "disconnected") {
    return { kind: "disconnected", labelFrench: "Relié · compte déconnecté", tone: "amber" };
  }
  return {
    kind: connection.kind,
    labelFrench: "Liaison enregistrée · à vérifier",
    tone: connection.tone,
  };
}
