import Image from "next/image";
import Link from "next/link";

export default function CGUPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-3xl p-8 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <Image
            src="/logo.webp" // ou /logo.webp
            alt="InvestPro Trading"
            width={52}
            height={52}
            className="rounded-2xl"
          />
          <div>
            <h1 className="text-2xl font-semibold">
              Conditions générales <span className="text-[color:var(--gold)]">d’utilisation</span>
            </h1>
            <p className="text-sm text-[color:var(--muted)] mt-1">
              Version démo — à personnaliser avant mise en production.
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-5 text-sm text-white/80 leading-relaxed">
          <section>
            <h2 className="text-white font-semibold">1. Objet</h2>
            <p className="mt-2 text-[color:var(--muted)]">
              InvestPro Trading fournit des outils de suivi (journal, rapports, calendrier, simulateur).
              Aucun contenu ne constitue un conseil financier.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold">2. Responsabilité</h2>
            <p className="mt-2 text-[color:var(--muted)]">
              L’utilisateur est seul responsable de ses décisions de trading. Les performances passées
              ne garantissent pas les performances futures.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold">3. Compte & sécurité</h2>
            <p className="mt-2 text-[color:var(--muted)]">
              En mode démo, les informations sont stockées localement. En production, la sécurité
              sera renforcée (auth, chiffrement, etc.).
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold">4. Disponibilité</h2>
            <p className="mt-2 text-[color:var(--muted)]">
              Le service peut être interrompu pour maintenance. Aucun SLA n’est garanti en mode démo.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold">5. Contact</h2>
            <p className="mt-2 text-[color:var(--muted)]">
              Pour toute question, utilisez la page “Nous contacter”.
            </p>
          </section>
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/login"
            className="px-5 py-3 rounded-2xl bg-[color:var(--gold)] text-black font-semibold hover:bg-[color:var(--gold-2)] transition"
          >
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}
