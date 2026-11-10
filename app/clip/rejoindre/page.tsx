import type { Metadata } from "next";
import JoinClippers from "./JoinClippers";

export const metadata: Metadata = {
  title: "Devenir clippeur",
  description: "Rejoins les clippeurs d'Enrick95 : coupe ses vidéos, publie sur tes comptes et sois payé pour chaque clip validé.",
  robots: { index: false, follow: false },
};

export default function JoinClippersPage() {
  return <JoinClippers />;
}
