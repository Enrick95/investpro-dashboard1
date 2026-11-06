import type { Metadata } from "next";
import SubscriberForm from "./SubscriberForm";

export const metadata: Metadata = { title: "Activer mon abonnement VIP · InvestPro", robots: { index: false, follow: false } };

export default function VipSubscriberPage() {
  return <SubscriberForm />;
}
