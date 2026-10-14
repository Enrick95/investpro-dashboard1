import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, Copy, Layers3, Settings2 } from "lucide-react";

export const metadata: Metadata = {
  title: "InvestPro Copy Futures — Bientôt",
  description:
    "InvestPro prépare son copieur pour les comptes futures. Découvrez le projet et retrouvez les prochaines annonces ici.",
};

const plannedFeatures = [
  {
    icon: Copy,
    title: "Vos comptes, une même stratégie",
    description:
      "L’objectif : reproduire vos opérations entre les comptes futures que vous détenez et contrôlez.",
  },
  {
    icon: Layers3,
    title: "Tout retrouver dans InvestPro",
    description:
      "Un espace dédié pour organiser vos comptes et suivre la copie depuis votre tableau de bord.",
  },
  {
    icon: Settings2,
    title: "Une copie adaptée à chaque compte",
    description:
      "Des réglages prévus pour adapter la taille des positions et les limites à chacun de vos comptes.",
  },
] as const;

export default function FuturesCopierPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 pb-8 text-[color:var(--text)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--gold)]">
          InvestPro Copy
        </p>
        <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--gold)]">
          <Clock3 size={14} aria-hidden="true" />
          Bientôt
        </span>
      </header>

      <section
        aria-labelledby="futures-title"
        className="relative overflow-hidden rounded-3xl border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-6 sm:p-10 lg:p-12"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[color:var(--gold-soft)] blur-3xl"
        />
        <div className="relative grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-center lg:gap-12">
          <div>
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
              <Copy size={26} aria-hidden="true" />
            </div>
            <h1
              id="futures-title"
              className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl"
            >
              InvestPro Copy
              <span className="mt-1 block text-[color:var(--gold)]">Futures</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[color:var(--muted)]">
              Le prochain chapitre du copieur InvestPro. Nous préparons un espace
              pour copier vos opérations entre vos comptes futures, avec une
              expérience simple et centralisée.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/dashboard/copieur"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[color:var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--panel)]"
              >
                Accéder au copieur CFD
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link
                href="/dashboard/journal"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[color:var(--border)] px-5 py-3 text-sm font-medium transition hover:bg-[color:var(--panel-2)] focus-visible:ring-2 focus-visible:ring-[color:var(--gold)]"
              >
                Retrouver mon journal
              </Link>
            </div>
          </div>

          <aside
            aria-labelledby="preparation-title"
            className="rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-6 sm:p-7"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--gold)]">
              Le projet avance
            </p>
            <h2 id="preparation-title" className="mt-3 text-xl font-semibold">
              En préparation
            </h2>
            <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
              Les plateformes compatibles, les conditions d’accès et la date
              d’ouverture seront annoncées ici.
            </p>
            <div className="mt-5 border-t border-[color:var(--gold-border)] pt-5">
              <p className="text-sm font-medium">Rendez-vous ici pour la suite.</p>
              <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">
                Le copieur Futures n’est pas encore disponible à l’activation.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section aria-labelledby="planned-features-title">
        <h2 id="planned-features-title" className="text-lg font-semibold">
          Ce que nous préparons
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {plannedFeatures.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-6"
            >
              <Icon
                size={22}
                aria-hidden="true"
                className="text-[color:var(--gold)]"
              />
              <h3 className="mt-4 text-base font-semibold leading-6">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
