import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";
import ToastHub from "../../components/ToastHub";
import Mt5Notifs from "../../components/Mt5Notifs";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="group min-h-screen bg-[#070709]">
      {/* Sidebar fixe */}
      <Sidebar />

      {/* Toute la partie droite */}
      <div
        className="
          min-h-screen
          ml-[88px]
          transition-[margin] duration-200 ease-out
          group-hover:ml-[280px]
        "
      >
        {/* Header */}
        <Header />

        {/* Notifications globales */}
        <ToastHub />
        <Mt5Notifs />

        {/* Contenu */}
        <main className="px-6 pt-8 pb-10">
          <div className="w-full max-w-[1500px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}