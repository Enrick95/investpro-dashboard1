"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const ADMIN_INBOX_UPDATED = "investpro-admin-inbox-updated";

/** Pending work, rather than unread messages: opening Inbox does not clear it. */
export function useAdminInboxCount(): number | null {
  const client = useMemo(() => createClient(), []);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    let generation = 0;
    let userId: string | null | undefined;
    let controller: AbortController | undefined;

    async function refresh(tokenOverride?: string | null, userOverride?: string | null) {
      const current = ++generation;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => request.abort(), 15_000);
      const currentRequest = () => alive && current === generation && !request.signal.aborted;
      try {
        let token = tokenOverride;
        let nextUser = userOverride;
        if (token === undefined) {
          const { data, error } = await client.auth.getSession();
          if (error) throw error;
          token = data.session?.access_token || null;
          nextUser = data.session?.user.id || null;
        }
        if (!currentRequest()) return;
        if (nextUser !== userId) {
          userId = nextUser;
          setCount(null);
        }
        if (!token) { setCount(null); return; }

        const response = await fetch("/api/admin/inbox/count", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: request.signal,
        });
        if (!currentRequest()) return;
        if (response.status === 401 || response.status === 403) { setCount(null); return; }
        if (!response.ok) return;
        const payload = await response.json();
        if (currentRequest() && Number.isSafeInteger(payload.total) && payload.total >= 0) setCount(payload.total);
      } catch {
        // Preserve the last confirmed count when a refresh is temporarily unavailable.
      } finally {
        window.clearTimeout(timeout);
      }
    }

    const recheck = () => { void refresh(); };
    const permissionsChanged = () => { setCount(null); recheck(); };
    const visible = () => { if (document.visibilityState === "visible") recheck(); };
    const auth = client.auth.onAuthStateChange((event, session) => {
      if (!alive || event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT" || session?.user.id !== userId || event === "USER_UPDATED") setCount(null);
      void refresh(event === "SIGNED_OUT" ? null : session?.access_token || null, session?.user.id || null);
    });
    void refresh();
    const interval = window.setInterval(visible, 20_000);
    window.addEventListener("focus", recheck);
    window.addEventListener(ADMIN_INBOX_UPDATED, recheck);
    window.addEventListener("investpro-admin-permissions-changed", permissionsChanged);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      generation++;
      controller?.abort();
      window.clearInterval(interval);
      auth.data.subscription.unsubscribe();
      window.removeEventListener("focus", recheck);
      window.removeEventListener(ADMIN_INBOX_UPDATED, recheck);
      window.removeEventListener("investpro-admin-permissions-changed", permissionsChanged);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [client]);
  return count;
}
