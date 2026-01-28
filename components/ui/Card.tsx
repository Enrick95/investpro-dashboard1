import React from "react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        // ✅ comportement stable en grid
        "h-full min-w-0 flex flex-col",
        // ✅ style (light clean + dark premium)
        "bg-[color:var(--panel)] border border-[color:var(--border)] rounded-2xl shadow-[var(--shadow-card)] dark:shadow-lg",
        // ✅ évite que des SVG/éléments dépassent et cassent l’alignement
        "overflow-hidden",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        // ✅ permet à la Card de “remplir” la hauteur et d’aligner le contenu
        "flex-1 min-w-0",
        "px-6 py-6",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function CardSubCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "bg-[color:var(--panel-2)] border border-[color:var(--border)] rounded-2xl p-4",
        "min-w-0",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
