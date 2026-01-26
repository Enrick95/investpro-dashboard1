"use client";

import { useEffect, useState } from "react";
import { Bell, Volume2, VolumeX, Sliders, Save } from "lucide-react";
import { useNotifs, toggleMute } from "@/lib/notifyStore";

type ThemeMode = "dark" | "light" | "system";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;

  const setDark = () => root.classList.add("dark");
  const setLight = () => root.classList.remove("dark");

  if (mode === "system") {
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    prefersDark ? setDark() : setLight();
    return;
  }

  mode === "dark" ? setDark() : setLight();
}

export default function ParametresPage() {
  const { settings } = useNotifs();

  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("ip_theme") as ThemeMode | null) || "dark";
    setTheme(saved);
  }, []);

  function setThemeAndPersist(t: ThemeMode) {
    setTheme(t);
    localStorage.setItem("ip_theme", t);
    applyTheme(t);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[color:var(--text,white)]">Paramètres</h1>
        <p className="text-sm mt-1 text-[color:var(--muted)]">
          Notifications, sons, préférences et thème.
        </p>
      </div>

      {/* Thème */}
      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] backdrop-blur p-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl border border-white/10 bg-black/10 dark:bg-black/20 flex items-center justify-center">
            <Sliders size={18} className="text-white/80" />
          </span>
          <div>
            <div className="text-base font-semibold text-[color:var(--text,white)]">Thème</div>
            <div className="text-xs text-[color:var(--muted)] mt-0.5">Clair / Foncé / Système</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {(["light", "dark", "system"] as ThemeMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setThemeAndPersist(m)}
              className={[
                "px-3 h-10 rounded-2xl border text-sm font-semibold transition",
                theme === m
                  ? "border-white/20 bg-white/10 text-[color:var(--text,white)]"
                  : "border-white/10 bg-black/5 dark:bg-black/20 text-[color:var(--muted)] hover:bg-white/5",
              ].join(" ")}
              type="button"
            >
              {m === "light" ? "Clair" : m === "dark" ? "Foncé" : "Auto"}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] backdrop-blur p-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl border border-white/10 bg-black/10 dark:bg-black/20 flex items-center justify-center">
            <Bell size={18} className="text-white/80" />
          </span>
          <div>
            <div className="text-base font-semibold text-[color:var(--text,white)]">Notifications</div>
            <div className="text-xs text-[color:var(--muted)] mt-0.5">Sons, volume, types</div>
          </div>

          <button
            onClick={toggleMute}
            className="ml-auto w-10 h-10 rounded-2xl border border-white/10 bg-black/5 dark:bg-black/20 hover:bg-white/5 transition flex items-center justify-center"
            title={settings.muted ? "Activer le son" : "Couper le son"}
            type="button"
          >
            {settings.muted ? (
              <VolumeX size={18} className="text-white/70" />
            ) : (
              <Volume2 size={18} className="text-white/70" />
            )}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-[color:var(--border)] p-4">
          <div className="text-sm font-semibold text-[color:var(--text,white)]">État actuel</div>
          <div className="text-sm text-[color:var(--muted)] mt-1">
            Sons: <span className="font-semibold">{settings.muted ? "OFF" : "ON"}</span>
          </div>

          <div className="mt-4 text-xs text-[color:var(--muted)]">
            Plus tard on peut ajouter : volume slider, sons par type (TP/SL/BE), “Do Not Disturb”, etc.
          </div>
        </div>

        <button
          className="mt-4 inline-flex items-center gap-2 px-4 h-10 rounded-2xl border border-white/10 bg-black/5 dark:bg-black/20 hover:bg-white/5 transition text-sm font-semibold text-[color:var(--text,white)]/80"
          type="button"
          onClick={() => {}}
        >
          <Save size={16} />
          Sauvegarder (optionnel)
        </button>
      </div>
    </div>
  );
}
