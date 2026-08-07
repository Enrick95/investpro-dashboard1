"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type CountryStat = {
  name: string;          // ex: "France"
  visitors: number;      // ex: 44123
  pageViews?: number;    // ex: 523000 (optionnel)
};

type Props = {
  /** Tu peux passer soit un tableau, soit un objet {key: CountryStat} */
  stats?: CountryStat[] | Record<string, CountryStat>;
  /** Chemin du geojson (doit exister dans /public) */
  geoJsonUrl?: string; // default: "/maps/countries.geojson"
  /** Hauteur de la carte */
  height?: number; // default: 420
};

type GeoJSONFeature = {
  type: "Feature";
  properties?: Record<string, any>;
  geometry: any;
};

type GeoJSON = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

function fmt(n: number) {
  return (n ?? 0).toLocaleString("fr-FR");
}

export default function AdminWorldVisitorsMap({
  stats,
  geoJsonUrl = "/maps/countries.geojson",
  height = 420,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [geo, setGeo] = useState<GeoJSON | null>(null);
  const [error, setError] = useState<string | null>(null);

  // viewport (pan/zoom)
  const [zoom, setZoom] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  // drag
  const dragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  // tooltip
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    name: string;
    visitors: number;
    pageViews?: number;
  } | null>(null);

  // ✅ normalize stats -> array safe
  const statsArray: CountryStat[] = useMemo(() => {
    if (!stats) return [];
    if (Array.isArray(stats)) return stats;
    return Object.values(stats);
  }, [stats]);

  // map by lowercase name
  const byName = useMemo(() => {
    const m = new Map<string, CountryStat>();
    for (const s of statsArray) {
      if (!s?.name) continue;
      m.set(String(s.name).toLowerCase(), s);
    }
    return m;
  }, [statsArray]);

  // load geojson
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError(null);
        const res = await fetch(geoJsonUrl, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`map_fetch_failed_${res.status}`);
        }
        const json = (await res.json()) as GeoJSON;
        if (!mounted) return;
        setGeo(json);
      } catch (e: any) {
        if (!mounted) return;
        setGeo(null);
        setError(String(e?.message || e));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [geoJsonUrl]);

  // SVG sizing
  const width = 1000;
  const viewH = 520;

  // Helpers: zoom/pan clamping
  function clamp(v: number, a: number, b: number) {
    return Math.max(a, Math.min(b, v));
  }

  function zoomIn() {
    setZoom((z) => clamp(Number((z + 0.15).toFixed(2)), 1, 3));
  }
  function zoomOut() {
    setZoom((z) => clamp(Number((z - 0.15).toFixed(2)), 1, 3));
  }
  function reset() {
    setZoom(1);
    setTx(0);
    setTy(0);
    setHover(null);
  }

  // Drag handlers
  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, tx, ty };
  }
  function onMouseUp() {
    dragging.current = false;
    dragStart.current = null;
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTx(dragStart.current.tx + dx);
    setTy(dragStart.current.ty + dy);
    // si on drag, on cache tooltip
    setHover(null);
  }

  // Wheel zoom
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    setZoom((z) => clamp(Number((z + dir * 0.08).toFixed(2)), 1, 3));
    setHover(null);
  }

  // --- Important :
  // Pour afficher les pays en “doré”, on se base sur properties.name / ADMIN / NAME / etc.
  function getCountryName(f: GeoJSONFeature) {
    const p = f.properties || {};
    return (
      p.name ||
      p.NAME ||
      p.admin ||
      p.ADMIN ||
      p.NAME_EN ||
      p.name_en ||
      p.sovereignt ||
      p.SOVEREIGNT ||
      ""
    );
  }

  // Simple “projection” :
  // Si ton geojson est déjà en coords “web mercator-ish” ou normalisé, ça marche.
  // Si ton geojson est un geojson classique lon/lat, il faut une vraie projection (d3-geo).
  // Vu que chez toi ça marchait quand tu avais le bon fichier, je garde ce mode.
  function pathFromFeature(f: GeoJSONFeature) {
    const g = f.geometry;
    if (!g) return "";
    const type = g.type;
    const coords = g.coordinates;

    const project = (lon: number, lat: number) => {
      // projection ultra simple “equirectangular”
      // lon [-180..180] => x [0..width]
      // lat [90..-90] => y [0..viewH]
      const x = ((lon + 180) / 360) * width;
      const y = ((90 - lat) / 180) * viewH;
      return [x, y] as const;
    };

    const ringToPath = (ring: number[][]) => {
      let d = "";
      for (let i = 0; i < ring.length; i++) {
        const [lon, lat] = ring[i];
        const [x, y] = project(lon, lat);
        d += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2) + " ";
      }
      return d + "Z";
    };

    if (type === "Polygon") {
      // coords: [ [ [lon,lat], ... ] , ...holes ]
      return (coords as number[][][]).map(ringToPath).join(" ");
    }
    if (type === "MultiPolygon") {
      // coords: [ polygon[ rings[] ] ... ]
      return (coords as number[][][][])
        .map((poly) => poly.map(ringToPath).join(" "))
        .join(" ");
    }
    return "";
  }

  return (
    <div
      ref={wrapRef}
      className="relative w-full rounded-2xl border border-white/10 bg-black/30 p-4"
      style={{ height }}
    >
      {/* Top actions */}
      <div className="absolute right-4 top-4 z-20 flex gap-2">
        <button
          onClick={zoomIn}
          className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
          title="Zoom +"
        >
          +
        </button>
        <button
          onClick={zoomOut}
          className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
          title="Zoom -"
        >
          −
        </button>
        <button
          onClick={reset}
          className="h-9 px-3 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
          title="Reset"
        >
          Reset
        </button>
      </div>

      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-30 min-w-[220px] rounded-2xl border border-white/10 bg-black/80 p-3 text-sm text-white shadow-2xl"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="mb-2 font-semibold">{hover.name}</div>
          <div className="flex justify-between gap-6 text-white/80">
            <span>Visiteurs</span>
            <span className="font-semibold text-[#d6b25e]">{fmt(hover.visitors)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-6 text-white/80">
            <span>Page views</span>
            <span className="font-semibold text-[#d6b25e]">{fmt(hover.pageViews ?? 0)}</span>
          </div>
        </div>
      )}

      {/* Map body */}
      <div
        className="h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent"
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          onMouseUp();
          setHover(null); // ✅ cache tooltip si on sort
        }}
        onMouseMove={onMouseMove}
        onWheel={onWheel}
      >
        {!geo && !error && (
          <div className="flex h-full items-center justify-center text-white/60">
            Chargement de la carte…
          </div>
        )}

        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/70">
            <div className="text-white">Map error: {error}</div>
            <div className="text-xs text-white/60">
              Vérifie que <span className="text-white">/public{geoJsonUrl}</span> existe.
            </div>
          </div>
        )}

        {geo && (
          <svg
            viewBox={`0 0 ${width} ${viewH}`}
            className="h-full w-full"
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
              transformOrigin: "center",
              cursor: dragging.current ? "grabbing" : "grab",
            }}
          >
            {/* Fond “pays” */}
            {geo.features.map((f, idx) => {
              const name = getCountryName(f);
              const key = String(name || idx);
              const d = pathFromFeature(f);
              if (!d) return null;

              const stat = byName.get(String(name).toLowerCase());
              const isGold = !!stat;

              return (
                <path
                  key={key}
                  d={d}
                  fill={isGold ? "#b8922b" : "rgba(255,255,255,0.06)"}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={0.6}
                  onMouseEnter={(e) => {
                    if (!stat) return;
                    const rect = wrapRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setHover({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                      name: stat.name,
                      visitors: stat.visitors,
                      pageViews: stat.pageViews,
                    });
                  }}
                  onMouseMove={(e) => {
                    if (!stat) return;
                    const rect = wrapRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setHover((cur) =>
                      cur
                        ? {
                            ...cur,
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top,
                          }
                        : {
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top,
                            name: stat.name,
                            visitors: stat.visitors,
                            pageViews: stat.pageViews,
                          }
                    );
                  }}
                  onMouseLeave={() => {
                    // ✅ tooltip uniquement si on est sur un pays doré
                    setHover(null);
                  }}
                />
              );
            })}
          </svg>
        )}
      </div>

      {/* Hint */}
      <div className="pointer-events-none absolute bottom-3 left-4 text-xs text-white/50">
        Zoom molette • Drag pour déplacer • Tooltip uniquement sur pays dorés
      </div>
    </div>
  );
}
