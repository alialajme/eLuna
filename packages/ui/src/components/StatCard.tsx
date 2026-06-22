import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string | number;
  delta?: string;
  deltaPositive?: boolean;
  icon?: ReactNode;
};

export function StatCard({ label, value, delta, deltaPositive, icon }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-sand bg-ivory p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-label uppercase tracking-widest text-mist">{label}</p>
          <p className="mt-2 font-display text-display-md text-ink">{value}</p>
          {delta && (
            <p className={`mt-1 text-body-sm font-medium ${deltaPositive ? "text-sage" : "text-coral"}`}>
              {deltaPositive ? "▲" : "▼"} {delta}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10 text-gold">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
