"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { pushNotif } from "@/lib/notifyStore";

function AdminLoginContent() {
  const router = useRouter();
  const sp = useSearchParams();

  const next =
    sp.get("next") ||
    "/dashboard/admin";

  const [passcode, setPasscode] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  async function login() {
    try {
      setBusy(true);

      const r = await fetch(
        "/api/admin/login",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            passcode,
          }),
        }
      );

      if (!r.ok) {
        pushNotif({
          kind: "error",
          title: "Accès refusé",
          message:
            "Code admin incorrect.",
          ttlMs: 2500,
        });

        return;
      }

      pushNotif({
        kind: "success",
        title: "OK",
        message:
          "Accès admin activé.",
        ttlMs: 1800,
      });

      router.replace(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[color:var(--bg)] text-[color:var(--text)] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Card>
          <CardBody>
            <div className="text-xl font-extrabold">
              Admin Login
            </div>

            <div className="mt-1 text-sm text-[color:var(--muted)]">
              Entrez votre code admin.
            </div>

            <div className="mt-4">
              <input
                type="password"
                value={passcode}
                onChange={(e) =>
                  setPasscode(
                    e.target.value
                  )
                }
                onKeyDown={(e) => {
                  if (
                    e.key ===
                    "Enter"
                  ) {
                    login();
                  }
                }}
                placeholder="Code admin…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-[color:var(--muted)]"
              />

              <div className="mt-2 h-[1px] bg-[color:var(--border)]" />
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                onClick={login}
                disabled={busy}
              >
                {busy
                  ? "Connexion…"
                  : "Entrer"}
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  router.replace(
                    "/dashboard"
                  )
                }
                disabled={busy}
              >
                Retour
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function LoadingAdminLogin() {
  return (
    <div className="min-h-screen w-full bg-[color:var(--bg)] text-[color:var(--text)] flex items-center justify-center">
      <div className="text-sm text-[color:var(--muted)]">
        Chargement…
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <LoadingAdminLogin />
      }
    >
      <AdminLoginContent />
    </Suspense>
  );
}