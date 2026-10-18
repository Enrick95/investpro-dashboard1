import { Suspense } from "react";
import AdminWorkspace from "@/components/admin/AdminWorkspace";

export default function AdminPage() {
  return <Suspense fallback={<div role="status" style={{ padding: 32, minHeight: "100dvh", background: "#080908", color: "#b0b1a6" }}>InvestPro · Administration…</div>}><AdminWorkspace /></Suspense>;
}
