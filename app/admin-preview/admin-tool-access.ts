export const ADMIN_TOOL_IDS = ["analytics", "annonces", "backoffice", "copieur", "feedback", "finance", "inbox", "moderation", "navigation", "overview-current", "serveurs", "staff", "systeme", "utilisateurs", "vip", "vip-publications"] as const;
export type AdminToolId = (typeof ADMIN_TOOL_IDS)[number];
export type AdminAccess = { owner: boolean; permissions: string[] };
export const VIP_ADMIN_VIEWS = ["members", "requests", "subscriptions", "affiliation", "settings"] as const;
export type VipAdminView = (typeof VIP_ADMIN_VIEWS)[number];
export type AdminWorkspacePath = "/admin-preview" | "/dashboard/admin";
export type AdminToolTarget = { tool: AdminToolId; memberId?: string; vipView?: VipAdminView };
export type AdminToolCheck = { status: "allowed"; access: AdminAccess } | { status: "signedOut" | "denied" | "unavailable" | "aborted" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RULES: Record<AdminToolId, { ownerOnly?: boolean; permissions: string[] }> = {
  analytics: { permissions: ["analytics"] }, annonces: { permissions: ["announcements_write"] }, backoffice: { ownerOnly: true, permissions: [] }, copieur: { permissions: ["copier"] }, feedback: { permissions: ["feedback"] }, finance: { permissions: ["finance"] }, inbox: { permissions: ["inbox"] }, moderation: { permissions: ["moderation"] }, navigation: { permissions: ["navigation"] }, "overview-current": { ownerOnly: true, permissions: [] }, serveurs: { ownerOnly: true, permissions: [] }, staff: { ownerOnly: true, permissions: [] }, systeme: { permissions: ["system"] }, utilisateurs: { ownerOnly: true, permissions: [] }, vip: { permissions: ["users", "users_write"] }, "vip-publications": { permissions: ["users_write"] },
};

export function isAdminToolId(value: unknown): value is AdminToolId {
  return typeof value === "string" && (ADMIN_TOOL_IDS as readonly string[]).includes(value);
}

export function isAdminMemberId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function parseAdminToolQuery(query: URLSearchParams): AdminToolTarget | null {
  if (query.getAll("tool").length !== 1 || query.getAll("member").length > 1 || query.getAll("view").length > 1) return null;
  const tool = query.get("tool");
  if (!isAdminToolId(tool)) return null;
  const member = query.get("member");
  if (member !== null && (tool !== "utilisateurs" || !isAdminMemberId(member))) return null;
  const view = query.get("view");
  if (view !== null && (tool !== "vip" || !(VIP_ADMIN_VIEWS as readonly string[]).includes(view))) return null;
  return { tool, ...(member ? { memberId: member.toLowerCase() } : {}), ...(view ? { vipView: view as VipAdminView } : {}) };
}

export function adminToolPreviewHref(tool: AdminToolId, memberId?: string, basePath: AdminWorkspacePath = "/admin-preview", vipView?: VipAdminView): string {
  if (!isAdminToolId(tool) || (memberId && (tool !== "utilisateurs" || !isAdminMemberId(memberId)))) throw new Error("Invalid admin preview target");
  if (basePath !== "/admin-preview" && basePath !== "/dashboard/admin") throw new Error("Invalid admin workspace path");
  if (vipView && (tool !== "vip" || !(VIP_ADMIN_VIEWS as readonly string[]).includes(vipView))) throw new Error("Invalid VIP view");
  const query = new URLSearchParams({ tool });
  if (memberId) query.set("member", memberId.toLowerCase());
  if (vipView) query.set("view", vipView);
  return `${basePath}?${query.toString()}`;
}

export function parseCurrentAdminPath(path: string): AdminToolTarget | null {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  let url: URL;
  try { url = new URL(path, "https://investpro.invalid"); } catch { return null; }
  if (url.origin !== "https://investpro.invalid") return null;
  const pathname = url.pathname.replace(/\/$/, "");
  if (pathname === "/dashboard/admin") return url.searchParams.has("tool") ? parseAdminToolQuery(url.searchParams) : { tool: "overview-current" };
  if (pathname === "/dashboard/vip" && url.searchParams.get("mode") === "admin") return { tool: "vip-publications" };
  const detail = pathname.match(/^\/dashboard\/admin\/utilisateurs\/([^/]+)$/);
  if (detail) return isAdminMemberId(detail[1]) ? { tool: "utilisateurs", memberId: detail[1].toLowerCase() } : null;
  const match = pathname.match(/^\/dashboard\/admin\/([^/]+)$/);
  return match && isAdminToolId(match[1]) && !["vip-publications", "overview-current"].includes(match[1]) ? { tool: match[1] } : null;
}

export function parseAdminAccess(payload: unknown): AdminAccess | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const info = payload as Record<string, unknown>;
  if (typeof info.owner !== "boolean" || !Array.isArray(info.permissions) || info.permissions.length > 64 || !info.permissions.every(value => typeof value === "string" && value.length < 80)) return null;
  return { owner: info.owner, permissions: info.permissions };
}

export function canOpenAdminTool(access: AdminAccess, tool: AdminToolId, memberId?: string): boolean {
  if (!isAdminToolId(tool) || (memberId && (tool !== "utilisateurs" || !isAdminMemberId(memberId)))) return false;
  if (access.owner === true) return true;
  if (tool === "utilisateurs" && memberId) return access.permissions.includes("users");
  const rule = RULES[tool];
  return !rule.ownerOnly && rule.permissions.every(permission => access.permissions.includes(permission));
}

/** The local session supplies transport credentials only. /api/admin/me verifies identity and permissions on the server. */
export async function checkAdminToolAccess({ tool, memberId, getToken, signal, fetcher = fetch }: AdminToolTarget & { getToken: () => Promise<string | null>; signal: AbortSignal; fetcher?: typeof fetch }): Promise<AdminToolCheck> {
  if (!isAdminToolId(tool) || (memberId && (tool !== "utilisateurs" || !isAdminMemberId(memberId)))) return { status: "denied" };
  try {
    const token = await getToken();
    if (signal.aborted) return { status: "aborted" };
    if (!token) return { status: "signedOut" };
    const response = await fetcher("/api/admin/me", { method: "GET", headers: { Authorization: `Bearer ${token}` }, credentials: "same-origin", cache: "no-store", signal });
    if (signal.aborted) return { status: "aborted" };
    if (response.status === 401) return { status: "signedOut" };
    if (response.status === 403) return { status: "denied" };
    if (!response.ok) return { status: "unavailable" };
    const access = parseAdminAccess(await response.json());
    if (signal.aborted) return { status: "aborted" };
    if (!access) return { status: "unavailable" };
    return canOpenAdminTool(access, tool, memberId) ? { status: "allowed", access } : { status: "denied" };
  } catch {
    return { status: signal.aborted ? "aborted" : "unavailable" };
  }
}
