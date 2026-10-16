"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadAdminNavigation } from "./admin-navigation";

export function useAdminNavigation(pathname: string, menuOpen: boolean): string | null {
  const client = useMemo(() => createClient(), []);
  const key = pathname + ":" + String(menuOpen);
  const [state, setState] = useState<{ key: string; destination: string | null }>({ key, destination: null });
  useEffect(() => {
    let alive = true;
    let generation = 0;
    let controller: AbortController | undefined;
    async function refresh(token?: string | null) {
      const current = ++generation;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const destination = await loadAdminNavigation({ signal: request.signal, getToken: async () => {
        if (token !== undefined) return token;
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        return data.session?.access_token || null;
      } });
      if (alive && current === generation && !request.signal.aborted) setState({ key, destination });
    }
    const auth = client.auth.onAuthStateChange((event, session) => {
      if (!alive || event === "INITIAL_SESSION") return;
      // Hide an old grant immediately; the new session must pass a fresh server check.
      setState({ key, destination: null });
      void refresh(event === "SIGNED_OUT" ? null : session?.access_token || null);
    });
    const recheck = () => {
      if (!alive) return;
      setState({ key, destination: null });
      void refresh();
    };
    const visible = () => { if (document.visibilityState === "visible") recheck(); };
    void refresh();
    window.addEventListener("focus", recheck);
    window.addEventListener("investpro-admin-permissions-changed", recheck);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      generation++;
      controller?.abort();
      auth.data.subscription.unsubscribe();
      window.removeEventListener("focus", recheck);
      window.removeEventListener("investpro-admin-permissions-changed", recheck);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [client, key]);
  return state.key === key ? state.destination : null;
}
