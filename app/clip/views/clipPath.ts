"use client";

import { useCallback, useEffect, useState } from "react";
import { clipPath } from "@/lib/clip/rules";

/** Chemin court sur investproclip.com (/login), chemin /clip/... ailleurs : à utiliser au moment d'un clic. */
export function clipPathNow(path: string): string {
  return typeof window === "undefined" ? path : clipPath(window.location.origin, path);
}

/** Même chose pour un lien affiché : le rendu serveur garde /clip/..., le navigateur passe au chemin court. */
export function useClipPath(): (path: string) => string {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return useCallback((path: string) => (origin ? clipPath(origin, path) : path), [origin]);
}
