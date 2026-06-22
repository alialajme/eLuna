export function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 px-4 py-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-sand bg-ivory">
          <div className="aspect-[3/4] bg-sand rounded-t-2xl" />
          <div className="p-4 space-y-2">
            <div className="h-3 bg-sand rounded w-1/2" />
            <div className="h-4 bg-sand rounded w-3/4" />
            <div className="h-4 bg-sand rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
