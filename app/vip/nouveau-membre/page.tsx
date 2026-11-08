import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Débloquer mon accès VIP",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** ?apercu=1 ouvre l'aperçu du nouveau design, sans rien envoyer au serveur. */
export default async function NewVipMemberPage({ searchParams }: Props) {
  const apercu = (await searchParams).apercu === "1";
  return <main style={{ position: "fixed", inset: 0, background: "#0b0d0b" }}>
    <iframe title="Débloquer mon accès VIP" src={apercu ? "/vip-nouveau-membre.html?apercu=1" : "/vip-nouveau-membre.html"} style={{ width: "100%", height: "100dvh", border: 0, display: "block" }} />
  </main>;
}
