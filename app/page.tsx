import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-3xl border border-[color:var(--border)] bg-[color:var(--panel)] p-6 shadow-2xl">
        <div className="text-sm text-[color:var(--muted)]">InvestPro Trading</div>
        <h1 className="mt-2 text-3xl font-semibold">
          Dashboard <span className="text-[color:var(--gold)]">noir & doré</span>
        </h1>
        <p className="mt-3 text-[color:var(--muted)]">
          Base OK. Clique pour aller sur la page Comptes.
        </p>

        <div className="mt-6 flex gap-3">
          <Link
            href="/dashboard/comptes"
            className="px-4 py-3 rounded-2xl bg-[color:var(--gold)] text-black font-semibold hover:bg-[color:var(--gold-2)] transition"
          >
            Ouvrir le dashboard
          </Link>

          <a
            className="px-4 py-3 rounded-2xl border border-[color:var(--gold-border)] text-white hover:bg-[color:var(--gold-soft)] transition"
            href="#"
          >
            Documentation
          </a>
        </div>
      </div>
    </main>
  );
}
