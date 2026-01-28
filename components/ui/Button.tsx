import React from "react";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-semibold transition select-none disabled:opacity-60 disabled:cursor-not-allowed";

  const variants: Record<
    NonNullable<Parameters<typeof Button>[0]["variant"]>,
    string
  > = {
    // ✅ Primary = gold (ok light + dark)
    primary:
      "bg-[color:var(--gold)] text-black hover:bg-[color:var(--gold-2)]",

    // ✅ Avant: text-white / bg-black/.. => cassait le light
    // ✅ Maintenant: theme-aware
    secondary:
      "border border-[color:var(--gold-border)] bg-transparent text-[color:var(--text)] hover:bg-[color:var(--gold-soft)]",

    // ✅ Ghost = discret, mais lisible en light + dark
    ghost:
      "border border-transparent text-[color:var(--muted)] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[color:var(--text)]",

    // ✅ Danger conserve le style premium
    danger:
      "bg-[color:var(--danger)]/15 border border-[color:var(--danger)]/25 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/25",
  };

  return (
    <button className={[base, variants[variant], className].join(" ")} {...props}>
      {children}
    </button>
  );
}

export default Button;
