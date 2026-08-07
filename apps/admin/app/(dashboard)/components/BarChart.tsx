type Props = { bars: { label: string; value: number }[] };

export function BarChart({ bars }: Props) {
  if (bars.length === 0) {
    return <p className="text-body-sm text-mist">No data yet.</p>;
  }

  const max = Math.max(...bars.map((b) => b.value), 0);

  return (
    <div className="flex h-28 items-end gap-3">
      {bars.map((b) => {
        const pct = max === 0 ? 0 : Math.round((b.value / max) * 100);
        return (
          <div key={b.label} className="flex flex-1 flex-col items-center">
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t bg-gold"
                style={{ height: `${pct}%` }}
              />
            </div>
            <p className="mt-1 truncate text-body-xs text-mist">{b.label}</p>
          </div>
        );
      })}
    </div>
  );
}
