"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { VipApiError, vipRequest, type VipAccess } from "@/lib/vip/client";
import s from "./vip.module.css";
import VipOnboardingShell from "./VipOnboardingShell";

const inviteStorage = "investpro-vip-invitation-v1";

export default function VipLanding({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [access, setAccess] = useState<VipAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nextPath = code.trim() ? `/vip?code=${encodeURIComponent(code.trim())}` : "/vip";
  const authQuery = `next=${encodeURIComponent(nextPath)}`;
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        let savedCode = initialCode;
        try { if (initialCode) sessionStorage.setItem(inviteStorage, initialCode); else savedCode = sessionStorage.getItem(inviteStorage) || ""; } catch { /* Private browsing may disable optional local storage. */ }
        const result = await vipRequest<VipAccess>("/api/vip/access").catch((cause) => {
          if (!(cause instanceof VipApiError) || cause.status !== 401) throw cause;
          return null;
        });
        if (alive) { setCode(savedCode); setAccess(result); }
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : "Impossible de vérifier votre accès."); }
      finally { if (alive) setLoading(false); }
    }
    void load();
    return () => { alive = false; };
  }, [initialCode]);
  function keepInvitation() { try { if (code.trim()) sessionStorage.setItem(inviteStorage, code.trim()); } catch { /* The original invitation link remains usable without storage. */ } }
  async function redeem(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await vipRequest("/api/vip/redeem", { method: "POST", body: JSON.stringify({ code: code.trim() }) });
      try { sessionStorage.removeItem(inviteStorage); } catch { /* Optional local storage. */ }
      window.dispatchEvent(new Event("investpro-vip-access-changed"));
      router.replace("/dashboard/vip");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "L’activation a échoué."); setBusy(false); }
  }
  return <VipOnboardingShell>
    <section className={s.invitation} aria-labelledby="vip-invitation-title">
        <div><span className={s.kicker}>VOTRE PROCHAINE ÉTAPE</span><h2 id="vip-invitation-title">Entrez dans votre orbite.</h2><p>Un seul compte InvestPro pour retrouver votre VIP et vos outils personnels.</p></div>
        <ol className={s.journey}><li><span>01</span><div><b>Activez votre espace</b><small>Avec votre invitation personnelle et votre compte InvestPro.</small></div></li><li><span>02</span><div><b>Emportez votre VIP</b><small>Ajoutez InvestPro sur votre téléphone et choisissez vos alertes.</small></div></li><li><span>03</span><div><b>Retrouvez Telegram</b><small>Rejoignez le canal depuis votre espace. L’équipe valide votre entrée.</small></div></li></ol>
        <div className={s.activation}>
          {loading ? <p role="status">Vérification de votre accès…</p> : access?.active ? <><span className={s.active}><ShieldCheck size={15} /> Votre espace est prêt</span><Link href="/dashboard/vip" className={s.primary}>Ouvrir mon espace VIP <ArrowRight size={17} /></Link></> : <>
            <form onSubmit={redeem}><label htmlFor="vip-code"><KeyRound size={15} /> Votre invitation personnelle</label><input id="vip-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Saisissez votre code d’invitation" autoComplete="off" spellCheck={false} maxLength={256} required />
              {access ? <><small>Connecté avec {access.user.email}. L’invitation doit être liée à cette adresse.</small><button className={s.primary} disabled={busy || !code.trim()}>{busy ? "Activation…" : "Activer mon espace"}<ArrowRight size={17} /></button></> : <div className={s.authActions}><Link onClick={keepInvitation} href={`/login?${authQuery}`} className={s.primary}>Me connecter <ArrowRight size={17} /></Link><Link onClick={keepInvitation} href={`/signup?${authQuery}`} className={s.secondary}>Créer mon compte</Link></div>}
            </form><small>{access ? "Votre adresse e-mail doit être confirmée pour activer l’accès." : "Déjà inscrit ? Conservez votre compte. Votre invitation vous attend après la connexion."}</small>
          </>}
          {error && <p className={s.error} role="alert">{error}</p>}
        </div>
      </section>
  </VipOnboardingShell>;
}
