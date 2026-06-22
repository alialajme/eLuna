"use client";

import { useEffect, useState } from "react";
import type { FilterState } from "./FilterBar";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const PRICE_PRESETS = [
  { label: "Under AED 400", min: "", max: "400" },
  { label: "AED 400–800", min: "400", max: "800" },
  { label: "AED 800–1,500", min: "800", max: "1500" },
  { label: "Over AED 1,500", min: "1500", max: "" },
];

type FilterDrawerProps = {
  open: boolean;
  onClose: () => void;
  current: FilterState;
  categories: string[];
  fabrics: string[];
  onApply: (filters: Partial<FilterState>) => void;
};

export function FilterDrawer({
  open,
  onClose,
  current,
  categories,
  fabrics,
  onApply,
}: FilterDrawerProps) {
  const [draft, setDraft] = useState<FilterState>(current);

  useEffect(() => {
    setDraft(current);
  }, [open, current]);

  if (!open) return null;

  function toggle<K extends keyof FilterState>(key: K, val: string) {
    setDraft((prev) => ({ ...prev, [key]: prev[key] === val ? undefined : val }));
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-ivory shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-sand bg-ivory px-5 py-4">
          <h2 className="font-sans text-body-lg font-semibold text-ink">Filters</h2>
          <button onClick={onClose} className="text-mist hover:text-ink text-xl" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="space-y-6 px-5 py-4">
          {/* Category */}
          {categories.length > 0 && (
            <section>
              <h3 className="mb-3 text-label uppercase text-mist">Category</h3>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => toggle("category", cat)}
                    className={`rounded-full px-4 py-2 text-body-sm transition-colors ${
                      draft.category === cat
                        ? "bg-ink text-ivory"
                        : "border border-sand text-ink hover:bg-sand"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Size */}
          <section>
            <h3 className="mb-3 text-label uppercase text-mist">Size</h3>
            <div className="flex flex-wrap gap-2">
              {SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => toggle("size", size)}
                  className={`h-10 w-14 rounded-lg text-body-sm font-medium transition-colors ${
                    draft.size === size
                      ? "bg-ink text-ivory"
                      : "border border-sand text-ink hover:bg-sand"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </section>

          {/* Fabric */}
          {fabrics.length > 0 && (
            <section>
              <h3 className="mb-3 text-label uppercase text-mist">Fabric</h3>
              <div className="flex flex-wrap gap-2">
                {fabrics.map((fabric) => (
                  <button
                    key={fabric}
                    onClick={() => toggle("fabric", fabric)}
                    className={`rounded-full px-4 py-2 text-body-sm transition-colors ${
                      draft.fabric === fabric
                        ? "bg-ink text-ivory"
                        : "border border-sand text-ink hover:bg-sand"
                    }`}
                  >
                    {fabric}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Price */}
          <section>
            <h3 className="mb-3 text-label uppercase text-mist">Price Range</h3>
            <div className="grid grid-cols-2 gap-2">
              {PRICE_PRESETS.map((preset) => {
                const isActive = draft.minPrice === preset.min && draft.maxPrice === preset.max;
                return (
                  <button
                    key={preset.label}
                    onClick={() =>
                      isActive
                        ? setDraft((prev) => ({ ...prev, minPrice: undefined, maxPrice: undefined }))
                        : setDraft((prev) => ({ ...prev, minPrice: preset.min || undefined, maxPrice: preset.max || undefined }))
                    }
                    className={`rounded-lg px-3 py-2.5 text-body-sm transition-colors ${
                      isActive ? "bg-ink text-ivory" : "border border-sand text-ink hover:bg-sand"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-3 border-t border-sand bg-ivory px-5 py-4">
          <button
            onClick={() => {
              setDraft({});
              onApply({});
            }}
            className="flex-1 rounded-full border border-sand py-3 text-body-md text-ink hover:bg-sand transition-colors"
          >
            Clear all
          </button>
          <button
            onClick={() => onApply(draft)}
            className="flex-1 rounded-full bg-ink py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors"
          >
            Show results
          </button>
        </div>
      </div>
    </>
  );
}
