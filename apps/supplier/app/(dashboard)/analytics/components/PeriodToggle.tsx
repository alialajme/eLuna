"use client";

import { useRouter, usePathname } from "next/navigation";

const PERIODS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
] as const;

type Props = { period: string };

export function PeriodToggle({ period }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex overflow-hidden rounded-full border border-sand">
      {PERIODS.map(({ label, value }) => (
        <button
          key={value}
          onClick={() => router.push(`${pathname}?period=${value}`)}
          className={
            period === value
              ? "bg-ink px-4 py-1.5 text-body-xs font-medium text-gold"
              : "px-4 py-1.5 text-body-xs text-mist hover:text-ink"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
