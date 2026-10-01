"use client";

import { useRouter, usePathname } from "next/navigation";

export type FilterOption = { label: string; value: string };

type Props = { status: string; options: FilterOption[] };

export function StatusFilter({ status, options }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(({ label, value }) => {
        const active = status === value;
        return (
          <button
            key={value}
            onClick={() =>
              router.push(value === "all" ? pathname : `${pathname}?status=${value}`)
            }
            className={
              active
                ? "rounded-md bg-ink px-4 py-1.5 text-body-xs font-medium text-sage"
                : "rounded-md px-4 py-1.5 text-body-xs text-mist hover:text-ink"
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
