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
        "bg-[color:var(--panel)] border border-[color:var(--border)] rounded-2xl shadow-lg",
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
  return <div className={["px-6 py-6", className].join(" ")}>{children}</div>;
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
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
