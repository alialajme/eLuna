"use client";

import { useRouter, usePathname } from "next/navigation";

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "PENDING" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Rejected", value: "REJECTED" },
] as const;

type Props = { status: string };

export function StatusFilter({ status }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTERS.map(({ label, value }) => {
        const active = status === value || (value === "all" && status === "all");
        return (
          <button
            key={value}
            onClick={() =>
              router.push(value === "all" ? pathname : `${pathname}?status=${value}`)
            }
            className={
              active
                ? "rounded-full bg-ink px-4 py-1.5 text-body-xs font-medium text-sage"
                : "rounded-full px-4 py-1.5 text-body-xs text-mist hover:text-ink"
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
