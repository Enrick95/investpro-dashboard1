import type { Metadata } from "next";
import Link from "next/link";
import FuturesCopierPage from "../dashboard/copieur-futures/page";

export const metadata: Metadata = {
  title: "InvestPro Copy Futures — Bientôt",
  description:
    "Le copieur InvestPro pour les comptes futures est en préparation. Découvrez le projet et les prochaines étapes.",
  alternates: { canonical: "/copy-futures" },
};

export default function PublicFuturesPage() {
  return (
    <main className="min-h-screen bg-[color:var(--bg)] px-4 py-6 text-[color:var(--text)] sm:px-8 sm:py-8">
      <nav
        aria-label="Navigation principale"
        className="mx-auto mb-10 flex w-full max-w-6xl items-center justify-between gap-4"
      >
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Invest<span className="text-[color:var(--gold)]">Pro</span>
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center rounded-xl border border-[color:var(--gold-border)] px-4 py-2 text-sm font-medium text-[color:var(--gold)] transition hover:bg-[color:var(--gold-soft)]"
        >
          Se connecter
        </Link>
      </nav>
      <FuturesCopierPage />
      <footer className="mx-auto mt-6 flex max-w-6xl flex-wrap gap-x-6 gap-y-3 border-t border-[color:var(--border)] py-6 text-xs text-[color:var(--muted)]">
        <Link href="/">Retour à l’accueil</Link>
        <Link href="/cgu">Conditions d’utilisation</Link>
      </footer>
    </main>
  );
}
