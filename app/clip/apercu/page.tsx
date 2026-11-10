import type { Metadata } from "next";
import ClipPreview from "./ClipPreview";

export const metadata: Metadata = {
  title: "Aperçu d'un espace clippeur",
  description: "Ce que voit un clippeur dans son espace, en lecture seule.",
  robots: { index: false, follow: false },
};

export default function ClipPreviewPage() {
  return <ClipPreview />;
}
