import type { Metadata } from "next";
import ClipApp from "./ClipApp";

export const metadata: Metadata = {
  title: "Espace clippeurs",
  description: "Espace des clippeurs d'Enrick95 : campagnes, clips, vues et paiements.",
  robots: { index: false, follow: false },
};

export default function ClipPage() {
  return <ClipApp />;
}
