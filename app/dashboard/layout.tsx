import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";
import ToastHub from "../../components/ToastHub";
import Mt5Notifs from "../../components/Mt5Notifs";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative">
      {/* ✅ Sidebar AU-DESSUS de tout */}
      <Sidebar />

      {/* ✅ Zone droite (header + contenu) */}
      <div className="flex min-h-screen flex-col">
        {/* Header ne se décale PAS */}
        <Header />

        {/* Notifications globales */}
        <ToastHub />
        <Mt5Notifs />

        {/* ✅ Contenu principal : se décale selon la sidebar */}
        <main
          className="
            flex-1 p-6
            pl-[88px]
            transition-[padding] duration-200 ease-out
            group-hover:pl-[280px]
          "
        >
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
