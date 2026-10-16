import type { ReactNode } from "react";
import DashboardFrame from "@/components/DashboardFrame";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardFrame>{children}</DashboardFrame>;
}
