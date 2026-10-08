"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { EyeOff, ArrowLeft } from "lucide-react";
import { defaultVisibility, navigationKeyForPath, type NavigationKey } from "@/lib/navigation/config";

export default function NavigationVisibilityGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [visibility, setVisibility] = useState<Record<NavigationKey, boolean>>(defaultVisibility());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/navigation", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.visibility) setVisibility((current) => ({ ...current, ...data.visibility }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [pathname]);

  const key = useMemo(() => navigationKeyForPath(pathname), [pathname]);
  const adminRoute = pathname.startsWith("/dashboard/admin");

  if (!loaded || adminRoute || !key || visibility[key] !== false) return <>{children}</>;

  return (
    <div className="flex min-h-[62vh] items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-7 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
          <EyeOff size={20} />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-white">Fonctionnalité temporairement masquée</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[color:var(--muted)]">
          Cette rubrique n’est pas disponible dans la navigation InvestPro pour le moment. Elle pourra être réactivée depuis le back-office.
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 py-2.5 text-sm font-semibold text-black no-underline">
          <ArrowLeft size={15} /> Retour au dashboard
        </Link>
      </div>
    </div>
  );
}
