"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ShieldCheck, Loader2 } from "lucide-react";

import AdminTopTabs from "../../../components/admin/AdminTopTabs";
import { createClient } from "@/lib/supabase/client";

type AdminState = "checking" | "allowed" | "denied";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [permissions,setPermissions]=useState<string[]>([]);
  const [owner,setOwner]=useState(false);
  const supabase = useMemo(() => createClient(), []);

  const [adminState, setAdminState] = useState<AdminState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function verifyAdmin() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          router.replace("/login");
          return;
        }

        // On utilise l'API admin existante : elle vérifie réellement
        // l'utilisateur Supabase côté serveur via INVESTPRO_ADMIN_USER_IDS.
        const response = await fetch("/api/admin/me", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        if (cancelled) return;

        if (response.status === 403) {
          setAdminState("denied");
          return;
        }

        if (!response.ok) {
          throw new Error("Vérification administrateur impossible.");
        }

        const info=await response.json();
        if(cancelled)return;
        setPermissions(info.permissions||[]);
        setOwner(info.owner===true);
        setAdminState("allowed");
      } catch (error) {
        console.error("Admin auth:", error);

        if (!cancelled) {
          setAdminState("denied");
        }
      }
    }

    verifyAdmin();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);
  const section=pathname.includes("/staff")?"staff":pathname.includes("/finance")?"finance":pathname.includes("/copieur")?"copier":pathname.includes("/navigation")?"navigation":pathname.includes("/systeme")?"system":pathname.includes("/moderation")?"moderation":pathname.includes("/inbox")?"inbox":pathname.includes("/utilisateurs")?"users":pathname.includes("/analytics")?"analytics":pathname.includes("/feedback")?"feedback":"overview";
  const sectionAllowed=owner||permissions.includes(section);

  if (adminState === "checking") {
    return (
      <div className="min-h-[calc(100vh-64px)] px-6 py-6">
        <div className="mx-auto flex min-h-[60vh] w-full max-w-[1600px] items-center justify-center">
          <div
            className="flex items-center gap-3 rounded-2xl border px-5 py-4"
            style={{
              borderColor: "rgba(255,255,255,.08)",
              background: "rgba(255,255,255,.03)",
              color: "var(--muted)",
            }}
          >
            <Loader2 className="h-4 w-4 animate-spin text-[color:var(--gold)]" />
            <span className="text-sm">Vérification de l’accès administrateur…</span>
          </div>
        </div>
      </div>
    );
  }

  if (adminState === "denied") {
    return (
      <div className="min-h-[calc(100vh-64px)] px-6 py-6">
        <div className="mx-auto flex min-h-[60vh] w-full max-w-[1600px] items-center justify-center">
          <div
            className="w-full max-w-md rounded-2xl border p-6 text-center"
            style={{
              borderColor: "rgba(239,68,68,.22)",
              background: "rgba(239,68,68,.05)",
            }}
          >
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-red-500/20 bg-red-500/[0.06] text-red-300">
              <ShieldCheck size={19} />
            </div>

            <div className="mt-4 text-lg font-semibold" style={{ color: "var(--text)" }}>
              Accès administrateur refusé
            </div>

            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Ce compte n’est pas présent dans la liste des administrateurs InvestPro.
            </p>

            <button
              type="button"
              onClick={() => router.replace("/dashboard")}
              className="mt-5 rounded-xl px-4 py-2 text-sm font-semibold"
              style={{
                background: "var(--gold)",
                color: "#050605",
              }}
            >
              Retour au dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if(!sectionAllowed)return <div className="p-8 text-red-300">Accès refusé : vous ne disposez pas des permissions pour cette rubrique.</div>;
  return (
    <div className="min-h-[calc(100vh-64px)] px-6 py-6">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-3xl font-bold" style={{ color: "var(--text)" }}>
              Admin — Overview
            </div>

            <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              InvestPro — accès administrateur sécurisé
            </div>
          </div>

          <div
            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
            style={{
              borderColor: "rgba(16,185,129,.18)",
              background: "rgba(16,185,129,.06)",
              color: "#34d399",
            }}
          >
            <ShieldCheck size={14} />
            Session admin vérifiée
          </div>
        </div>

        <div className="mt-4">
          <AdminTopTabs permissions={permissions} />
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
