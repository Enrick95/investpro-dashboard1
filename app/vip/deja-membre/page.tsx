import type { Metadata } from "next";
import ExistingMemberIntake from "./ExistingMemberIntake";

export const metadata: Metadata = {
  title: "Déjà membre VIP — InvestPro Trading",
  description: "Rattachez votre accès Telegram VIP à votre compte personnel InvestPro.",
  robots: { index: false, follow: false },
};

export default function ExistingMemberPage() { return <ExistingMemberIntake />; }
