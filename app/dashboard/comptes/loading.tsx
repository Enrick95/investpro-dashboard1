export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] animate-pulse space-y-4 pb-10">
      <div className="h-36 rounded-[24px] border border-white/[0.06] bg-white/[0.025]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-24 rounded-2xl border border-white/[0.06] bg-white/[0.025]"
          />
        ))}
      </div>
      <div className="h-80 rounded-[22px] border border-white/[0.06] bg-white/[0.025]" />
    </div>
  );
}
