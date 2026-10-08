import { Building2, Handshake, ShieldCheck, Sparkles, Wrench } from "lucide-react";

const cards = [
  { icon: Building2, eyebrow: "BROKERS & PLATEFORMES", title: "Solutions de trading", text: "Retrouve les brokers et plateformes partenaires compatibles avec l’écosystème InvestPro." },
  { icon: ShieldCheck, eyebrow: "PROP FIRMS", title: "Comptes financés", text: "Les offres et avantages négociés avec les partenaires prop firm pourront être regroupés ici." },
  { icon: Wrench, eyebrow: "OUTILS & SERVICES", title: "Ressources partenaires", text: "Outils, services et solutions utilisés autour du trading et de la gestion de compte." },
];

export default function PartenairesPage() {
  return (
    <div className="space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-7 md:p-9">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[color:var(--gold)] opacity-[.07] blur-[100px]"/>
        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[color:var(--gold)]">
            <Handshake size={13}/> Écosystème InvestPro
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-white md:text-4xl">Nos <span className="text-[color:var(--gold)]">partenaires</span></h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">Un espace unique pour consulter les partenaires, plateformes, avantages et services liés à InvestPro Trading.</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {cards.map(({icon:Icon,eyebrow,title,text}) => (
          <article key={title} className="rounded-[22px] border border-white/[.07] bg-[color:var(--panel)] p-5">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"><Icon size={18}/></div>
            <div className="mt-5 text-[9px] font-bold tracking-[.16em] text-[color:var(--gold)]">{eyebrow}</div>
            <h2 className="mt-2 text-lg font-semibold text-white">{title}</h2>
            <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{text}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[22px] border border-[color:var(--gold-border)] bg-gradient-to-br from-[color:var(--gold-soft)] to-transparent p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-black/25 text-[color:var(--gold)]"><Sparkles size={18}/></div>
          <div>
            <h2 className="text-lg font-semibold text-white">Les offres partenaires arrivent progressivement</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">Cette rubrique est prête. Tu pourras ensuite y publier les partenaires officiels, liens dédiés, conditions et avantages sans mélanger cela avec les outils de trading.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
