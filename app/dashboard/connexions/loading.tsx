export default function ConnectionsLoading() {
  return (
    <div className="mx-auto max-w-[1420px] animate-pulse space-y-5 pb-10">
      <div className="h-[280px] rounded-[28px] border border-white/[0.06] bg-white/[0.025]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 rounded-[20px] border border-white/[0.06] bg-white/[0.025]"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-64 rounded-[22px] border border-white/[0.06] bg-white/[0.025]"
          />
        ))}
      </div>
    </div>
  );
}
