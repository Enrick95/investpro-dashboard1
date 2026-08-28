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
    <div className="group min-h-screen overflow-x-hidden bg-[#070709]">
      {/* =====================================================
          NAVIGATION
          - Desktop : sidebar fixe
          - Mobile : bottom navigation gérée dans Sidebar.tsx
      ===================================================== */}
      <Sidebar />

      {/* =====================================================
          ZONE PRINCIPALE
          - Mobile : pleine largeur
          - Desktop : marge selon la sidebar
      ===================================================== */}
      <div
        className="
          min-h-screen
          w-full
          ml-0
          transition-[margin] duration-200 ease-out

          lg:ml-[88px]
          lg:w-[calc(100%-88px)]

          lg:group-hover:ml-[280px]
          lg:group-hover:w-[calc(100%-280px)]
        "
      >
        {/* ===================================================
            HEADER
            Sticky sur mobile pour donner l'effet application
        =================================================== */}
        <div className="sticky top-0 z-[60] lg:static">
          <Header />
        </div>

        {/* Notifications globales */}
        <ToastHub />
        <Mt5Notifs />

        {/* ===================================================
            CONTENU
            Mobile :
            - padding réduit
            - espace en bas pour la navigation fixe
            Desktop :
            - conserve ton rendu actuel
        =================================================== */}
        <main
          className="
            w-full
            px-4
            pt-5
            pb-[110px]

            sm:px-5

            lg:px-6
            lg:pt-8
            lg:pb-10
          "
        >
          <div
            className="
              w-full
              max-w-[1500px]
              mx-auto
              min-w-0
            "
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
