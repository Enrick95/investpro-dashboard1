export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-semibold transition select-none";

  const variants: Record<string, string> = {
    primary: "bg-[color:var(--gold)] text-black hover:bg-[color:var(--gold-2)]",
    secondary:
      "border border-[color:var(--gold-border)] hover:bg-[color:var(--gold-soft)] text-white",
    ghost:
      "border border-transparent hover:bg-white/5 text-[color:var(--muted)] hover:text-white",
    danger:
      "bg-[color:var(--danger)]/15 border border-[color:var(--danger)]/25 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/25",
  };

  return (
    <button
      className={[base, variants[variant], className].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
