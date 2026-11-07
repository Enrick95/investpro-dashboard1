import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import AccessLanding from "./AccessLanding";

export const metadata: Metadata = {
  title: "Accès VIP · maquette de test",
  description: "Maquette de test de la page d’accès VIP. Rien n’est envoyé et aucun compte n’est créé.",
  robots: { index: false, follow: false },
};

/** Test page: served only on Vercel preview deployments, never on production. */
export default async function VipAccesPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  const host = (await headers()).get("host") || "";
  if (!/^[a-z0-9.-]+\.vercel\.app$/i.test(host)) notFound();
  return <AccessLanding />;
}
