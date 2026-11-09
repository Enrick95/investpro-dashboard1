import type { Metadata } from "next";
import ClipAdmin from "./ClipAdmin";

export const metadata: Metadata = {
  title: "Admin clippeurs",
  description: "Suivi des clippeurs, des clips, des vues et des paiements.",
  robots: { index: false, follow: false },
};

export default function ClipAdminPage() {
  return <ClipAdmin />;
}
