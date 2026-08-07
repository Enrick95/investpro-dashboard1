"use client";

import { useEffect, useState } from "react";
import { getCurrentAccount } from "../lib/authStore";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const acc = getCurrentAccount();

    if (!acc) {
      setAllowed(false);
      window.location.href = "/login";
      return;
    }

    setAllowed(true);
  }, []);

  if (allowed === null) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-[color:var(--muted)]">
        Vérification de la connexion...
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}