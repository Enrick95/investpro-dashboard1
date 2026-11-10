import type { Metadata } from "next";
import ClipApp from "../ClipApp";

/** investproclip.com/login : connexion des clippeurs, puis leur espace (campagnes, clips, paiements). */
export const metadata: Metadata = {
  title: "Espace clippeurs",
  description: "Connecte-toi à ton espace clippeur : campagnes, vidéos à clipper, clips et paiements.",
  robots: { index: false, follow: false },
};

export default function ClipLoginPage() {
  return <ClipApp />;
}
