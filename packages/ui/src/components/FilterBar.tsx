"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { FilterDrawer } from "./FilterDrawer";

export type FilterState = {
  category?: string;
  size?: string;
  fabric?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  q?: string;
};

type FilterBarProps = {
  categories?: string[];
  fabrics?: string[];
  totalCount: number;
};

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "rating", label: "Most Reviewed" },
];

export function FilterBar({ categories = [], fabrics = [], totalCount }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const current: FilterState = {
    category: searchParams.get("category") ?? undefined,
    size: searchParams.get("size") ?? undefined,
    fabric: searchParams.get("fabric") ?? undefined,
    minPrice: searchParams.get("minPrice") ?? undefined,
    maxPrice: searchParams.get("maxPrice") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  };

  const applyFilter = useCallback(
    (updates: Partial<FilterState>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, val]) => {
        if (val) {
          params.set(key, val);
        } else {
          params.delete(key);
        }
      });
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const removeFilter = useCallback(
    (key: keyof FilterState) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete(key);
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const activeFilters = Object.entries(current).filter(
    ([key, val]) => val && key !== "sort" && key !== "q"
  ) as [string, string][];

  return (
    <div className="sticky top-16 z-10 border-b border-sand bg-ivory/95 backdrop-blur-sm">
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
        {/* Active filter chips */}
        {activeFilters.map(([key, val]) => (
          <button
            key={key}
            onClick={() => removeFilter(key as keyof FilterState)}
            className="flex shrink-0 items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-body-sm font-medium text-ivory"
          >
            {val}
            <span aria-hidden>✕</span>
          </button>
        ))}

        {/* Filters trigger */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="shrink-0 rounded-full border border-sand px-3 py-1.5 text-body-sm text-ink hover:bg-sand transition-colors"
        >
          + Filters
        </button>

        {/* Result count */}
        <span className="shrink-0 text-body-sm text-mist">
          {totalCount} result{totalCount !== 1 ? "s" : ""}
        </span>

        {/* Sort — pushed to right */}
        <div className="ml-auto shrink-0">
          <select
            value={current.sort ?? "newest"}
            onChange={(e) => applyFilter({ sort: e.target.value })}
            className="rounded-full border border-sand bg-ivory px-3 py-1.5 text-body-sm text-ink focus:outline-none focus:ring-1 focus:ring-gold"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        current={current}
        categories={categories}
        fabrics={fabrics}
        onApply={(filters) => {
          applyFilter(filters);
          setDrawerOpen(false);
        }}
      />
    </div>
  );
}
