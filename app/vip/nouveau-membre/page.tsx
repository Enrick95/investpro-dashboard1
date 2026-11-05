import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Débloquer mon accès VIP",
  robots: { index: false, follow: false },
};

export default function NewVipMemberPage() {
  return <main style={{ position: "fixed", inset: 0, background: "#0b0d0b" }}>
    <iframe title="Débloquer mon accès VIP" src="/vip-nouveau-membre.html" style={{ width: "100%", height: "100dvh", border: 0, display: "block" }} />
  </main>;
}
