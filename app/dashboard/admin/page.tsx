import { Suspense } from "react";
import AdminWorkspace from "@/components/admin/AdminWorkspace";

export default function AdminPage() {
  return <Suspense fallback={<div role="status" style={{ padding: 32, minHeight: "100dvh", background: "#07100b", color: "#a7b99c" }}>InvestPro · Administration…</div>}><AdminWorkspace /></Suspense>;
}
