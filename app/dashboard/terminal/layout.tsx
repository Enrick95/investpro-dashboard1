import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function TerminalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const c = await cookies();
  const isAdmin = c.get("ip_admin")?.value === "1";
  const maintenanceOn = c.get("ip_maintenance")?.value === "1";

  if (maintenanceOn && !isAdmin) {
    redirect("/maintenance?from=/dashboard/terminal");
  }

  return <>{children}</>;
}
