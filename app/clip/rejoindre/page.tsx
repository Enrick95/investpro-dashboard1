import type { Metadata } from "next";
import JoinClippers from "./JoinClippers";

export const metadata: Metadata = {
  title: "Devenir clippeur",
  description: "Rejoins les clippeurs d'Enrick95 : coupe son contenu, publie sur tes comptes et sois payé selon tes vues.",
  robots: { index: false, follow: false },
};

export default function JoinClippersPage() {
  return <JoinClippers />;
}
