"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import styles from "../clip.module.css";
import ClipLogin from "../ClipLogin";
import { ClipApiError, clipApi } from "@/lib/clip/client";
import { ClipperSpace, type Me } from "../ClipApp";

type State = { phase: "loading" } | { phase: "login" } | { phase: "error"; message: string } | { phase: "ready"; me: Me };

/** Aperçu admin de l'espace d'un clippeur : mêmes écrans, aucune action envoyée. */
export default function ClipPreview() {
  const [state, setState] = useState<State>({ phase: "loading" });

  const load = useCallback(async () => {
    const id = new URLSearchParams(window.location.search).get("c") ?? "";
    try {
      const me = await clipApi<Me>(`/api/clip/admin/apercu?clipper=${encodeURIComponent(id)}`);
      setState({ phase: "ready", me });
    } catch (error) {
      if (error instanceof ClipApiError && error.status === 401) setState({ phase: "login" });
      else setState({ phase: "error", message: error instanceof Error ? error.message : "Aperçu impossible." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.phase === "loading") {
    return <div className={styles.page}><div className={styles.center}><Loader2 size={28} className={styles.spin} aria-hidden="true" /><span className={styles.muted}>Chargement de l&apos;aperçu…</span></div></div>;
  }
  if (state.phase === "login") {
    return (
      <div className={styles.page}>
        <div className={styles.app}>
          <main className={styles.main} style={{ paddingTop: 32, paddingBottom: 48 }}>
            <h1 className={styles.h1}>Aperçu clippeur</h1>
            <ClipLogin title="Connexion admin" intro="Connecte-toi avec ton compte administrateur pour voir l'espace de ce clippeur." joinLink={false} onDone={() => { setState({ phase: "loading" }); void load(); }} />
          </main>
        </div>
      </div>
    );
  }
  if (state.phase === "error" || !state.me.clipper) {
    return (
      <div className={styles.page}>
        <div className={styles.center}>
          <p className={styles.error}>{state.phase === "error" ? state.message : "Clippeur introuvable."}</p>
          <Link href="/clip/admin#clippers" className={styles.btnGhost}>Retour à l&apos;admin</Link>
        </div>
      </div>
    );
  }
  return <ClipperSpace me={state.me} clipper={state.me.clipper} reload={load} preview={{ name: state.me.clipper.display_name, backHref: "/clip/admin#clippers" }} />;
}
