import { adminToolPreviewHref, canOpenAdminTool, parseAdminAccess, type AdminToolId } from "../../app/admin-preview/admin-tool-access";

/** Menu visibility is presentation only. Every destination independently checks server permissions. */
export function adminNavigationDestination(payload: unknown): string | null {
  const access = parseAdminAccess(payload);
  if (!access) return null;
  if (access.owner) return "/dashboard/admin";
  if (canOpenAdminTool(access, "vip")) return adminToolPreviewHref("vip", undefined, "/dashboard/admin", "requests");
  const tools: AdminToolId[] = ["inbox", "copieur", "finance", "analytics", "feedback", "moderation", "annonces", "navigation", "systeme", "vip-publications"];
  const tool = tools.find(value => canOpenAdminTool(access, value));
  return tool ? adminToolPreviewHref(tool, undefined, "/dashboard/admin") : null;
}

/** A Supabase session supplies transport credentials only; /api/admin/me verifies identity and rights. */
export async function loadAdminNavigation({ getToken, signal, fetcher = fetch }: { getToken: () => Promise<string | null>; signal: AbortSignal; fetcher?: typeof fetch }): Promise<string | null> {
  try {
    if (signal.aborted) return null;
    const token = await getToken();
    if (signal.aborted || !token) return null;
    const response = await fetcher("/api/admin/me", { headers: { Authorization: `Bearer ${token}` }, credentials: "same-origin", cache: "no-store", signal });
    if (!response.ok || signal.aborted) return null;
    const payload: unknown = await response.json();
    return signal.aborted ? null : adminNavigationDestination(payload);
  } catch {
    return null;
  }
}
