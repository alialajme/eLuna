# Phase 2 — Plan 2: UI Components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all new shared UI components needed by Phase 2 pages: FilterBar, FilterDrawer, ProductGallery, SizeSelector, ChatMessage, and LunaChatWidget.

**Architecture:** All components live in `packages/ui/src/components/` and are exported from `packages/ui/src/index.ts`. They are pure React components — no direct DB or AI calls. The LunaChatWidget accepts a `serverAction` prop so the customer app can inject the real chat action (wired in Plan 4).

**Tech Stack:** React 19 · TypeScript · Tailwind CSS (Warm Oud tokens) · Vercel AI SDK `useChat`

**Dependency:** Run after Plan 1 (tokens must be updated first so class names are correct).

---

## File Map

| File | Action |
|---|---|
| `packages/ui/src/components/FilterBar.tsx` | Create |
| `packages/ui/src/components/FilterDrawer.tsx` | Create |
| `packages/ui/src/components/ProductGallery.tsx` | Create |
| `packages/ui/src/components/SizeSelector.tsx` | Create |
| `packages/ui/src/components/ChatMessage.tsx` | Create |
| `packages/ui/src/components/LunaChatWidget.tsx` | Create |
| `packages/ui/src/index.ts` | Modify — add 6 new exports |
| `packages/ui/package.json` | Modify — add `ai` dep for useChat |

---

## Task 1: FilterBar + FilterDrawer

These two components work together. FilterBar renders the pill row at the top of /browse. FilterDrawer is the bottom-sheet overlay that opens when the user taps "+ Filters".

**Files:**
- Create: `packages/ui/src/components/FilterBar.tsx`
- Create: `packages/ui/src/components/FilterDrawer.tsx`

- [ ] **Step 1: Create FilterBar.tsx**

```tsx
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

  const sortLabel = SORT_OPTIONS.find((o) => o.value === current.sort)?.label ?? "Sort";

  return (
    <>
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
    </>
  );
}
```

- [ ] **Step 2: Create FilterDrawer.tsx**

```tsx
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
  }, [open]);

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
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm --filter @e-luna/ui exec tsc --noEmit
```

Expected: no errors.

---

## Task 2: ProductGallery

**Files:**
- Create: `packages/ui/src/components/ProductGallery.tsx`

- [ ] **Step 1: Create ProductGallery.tsx**

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";

type ProductGalleryProps = {
  images: string[];
  title: string;
};

export function ProductGallery({ images, title }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex];

  return (
    <div className="flex flex-col gap-3">
      {/* Main image */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-sand">
        {activeImage ? (
          <Image
            src={activeImage}
            alt={title}
            fill
            className="object-cover transition-opacity duration-200"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
        ) : (
          <div className="flex h-full items-center justify-center text-mist text-body-sm">
            No image
          </div>
        )}
      </div>

      {/* Thumbnail strip — shown only if more than 1 image */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {images.map((src, i) => (
            <button
              key={src}
              onClick={() => setActiveIndex(i)}
              className={`relative h-16 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                i === activeIndex ? "border-gold" : "border-transparent"
              }`}
              aria-label={`View image ${i + 1}`}
            >
              <Image
                src={src}
                alt={`${title} thumbnail ${i + 1}`}
                fill
                className="object-cover"
                sizes="48px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @e-luna/ui exec tsc --noEmit
```

---

## Task 3: SizeSelector

**Files:**
- Create: `packages/ui/src/components/SizeSelector.tsx`

- [ ] **Step 1: Create SizeSelector.tsx**

```tsx
"use client";

type VariantStock = {
  size: string;
  stock: number;
  variantId: string;
};

type SizeSelectorProps = {
  variants: VariantStock[];
  selectedSize: string | null;
  recommendedSize?: string | null;
  onSelect: (size: string, variantId: string) => void;
};

export function SizeSelector({
  variants,
  selectedSize,
  recommendedSize,
  onSelect,
}: SizeSelectorProps) {
  const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
  const uniqueSizes = sizeOrder.filter((s) => variants.some((v) => v.size === s));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-label uppercase text-mist">Size</span>
        {recommendedSize && (
          <span className="text-body-sm text-gold">✦ Your size: {recommendedSize}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {uniqueSizes.map((size) => {
          const variant = variants.find((v) => v.size === size);
          const stock = variant?.stock ?? 0;
          const isOutOfStock = stock === 0;
          const isSelected = selectedSize === size;
          const isRecommended = recommendedSize === size;
          const isLowStock = stock > 0 && stock <= 5;

          return (
            <div key={size} className="relative">
              <button
                onClick={() => !isOutOfStock && variant && onSelect(size, variant.variantId)}
                disabled={isOutOfStock}
                aria-label={`Size ${size}${isOutOfStock ? " — out of stock" : ""}${isRecommended ? " — recommended for you" : ""}`}
                className={`relative h-11 min-w-[3rem] rounded-lg px-3 text-body-md font-medium transition-all ${
                  isSelected
                    ? "bg-ink text-ivory"
                    : isOutOfStock
                    ? "cursor-not-allowed border border-sand text-mist line-through opacity-50"
                    : isRecommended
                    ? "border-2 border-gold text-ink hover:bg-sand"
                    : "border border-sand text-ink hover:bg-sand"
                }`}
              >
                {size}
                {isRecommended && !isSelected && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-gold" />
                )}
              </button>
              {isLowStock && !isOutOfStock && (
                <span className="absolute -bottom-4 left-0 whitespace-nowrap text-body-sm text-coral">
                  Only {stock} left
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @e-luna/ui exec tsc --noEmit
```

---

## Task 4: ChatMessage

**Files:**
- Create: `packages/ui/src/components/ChatMessage.tsx`

- [ ] **Step 1: Create ChatMessage.tsx**

The `[PRODUCT:slug]` token in AI messages is replaced with a mini product card.

```tsx
import { ProductCard } from "./ProductCard";

type MiniProduct = {
  slug: string;
  title: string;
  price: number;
  imageUrl?: string;
  vendorName: string;
};

type ChatMessageProps = {
  role: "user" | "assistant";
  content: string;
  products?: MiniProduct[];
};

const PRODUCT_TOKEN_REGEX = /\[PRODUCT:([a-z0-9-]+)\]/g;

export function ChatMessage({ role, content, products = [] }: ChatMessageProps) {
  const isUser = role === "user";

  // Split content on [PRODUCT:slug] tokens
  const parts = content.split(PRODUCT_TOKEN_REGEX);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-3`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-ivory text-body-sm font-semibold">
          ◑
        </div>
      )}

      <div className={`max-w-[80%] space-y-2 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-3 text-body-md ${
            isUser
              ? "rounded-br-sm bg-ink text-ivory"
              : "rounded-bl-sm bg-sand text-ink"
          }`}
        >
          {parts.map((part, i) => {
            // Even indices are text, odd indices are product slugs
            if (i % 2 === 0) {
              return (
                <span key={i} className="whitespace-pre-wrap">
                  {part}
                </span>
              );
            }
            const product = products.find((p) => p.slug === part);
            return product ? null : (
              <span key={i} className="text-gold underline">
                {part}
              </span>
            );
          })}
        </div>

        {/* Inline product cards for any [PRODUCT:slug] tokens */}
        {parts
          .filter((_, i) => i % 2 === 1)
          .map((slug) => {
            const product = products.find((p) => p.slug === slug);
            if (!product) return null;
            return (
              <div key={slug} className="w-48">
                <a href={`/p/${product.slug}`} className="block">
                  <ProductCard
                    id={product.slug}
                    title={product.title}
                    price={product.price}
                    imageUrl={product.imageUrl}
                    vendorName={product.vendorName}
                  />
                </a>
              </div>
            );
          })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @e-luna/ui exec tsc --noEmit
```

---

## Task 5: LunaChatWidget

The widget is a floating bubble that expands to a chat panel. It accepts a `serverAction` prop — the actual streaming chat function is injected from the customer app (Plan 4). This keeps `packages/ui` free of app-specific Server Actions.

**Files:**
- Modify: `packages/ui/package.json` — add `ai` dep
- Create: `packages/ui/src/components/LunaChatWidget.tsx`

- [ ] **Step 1: Add ai to packages/ui package.json**

Update `packages/ui/package.json` to add the `ai` dependency:

```json
{
  "name": "@e-luna/ui",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "ai": "^4.3.19"
  },
  "devDependencies": {
    "@e-luna/config": "workspace:*",
    "typescript": "^5.4.0"
  },
  "peerDependencies": {
    "next": ">=15.0.0",
    "react": ">=19.0.0"
  }
}
```

Then run:

```bash
pnpm install
```

- [ ] **Step 2: Create LunaChatWidget.tsx**

```tsx
"use client";

import { useChat } from "ai/react";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import type { Message } from "ai";
import { ChatMessage } from "./ChatMessage";

type LunaChatWidgetProps = {
  apiPath: string; // e.g. "/api/chat" — route handler in customer app
};

export function LunaChatWidget({ apiPath }: LunaChatWidgetProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: apiPath,
  });

  // Hide on the full chat page
  if (pathname === "/chat") return null;

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      {open && (
        <div className="flex h-[520px] w-[380px] flex-col overflow-hidden rounded-2xl border border-sand bg-ivory shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-ink px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-gold text-lg">◑</span>
              <span className="font-sans text-body-md font-semibold text-ivory">Luna Stylist</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-ivory/60 hover:text-ivory"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="text-center text-body-sm text-mist pt-8">
                <p className="text-gold text-2xl mb-2">◑</p>
                <p>مرحباً! I'm Luna.</p>
                <p className="mt-1">Tell me your occasion and I'll find your perfect abaya.</p>
              </div>
            )}
            {messages.map((m: Message) => (
              <ChatMessage key={m.id} role={m.role as "user" | "assistant"} content={m.content} />
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-sand px-4 py-3 text-body-sm text-mist">
                  Luna is thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-sand p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={handleInputChange}
                placeholder="Ask Luna anything…"
                className="flex-1 rounded-full border border-sand bg-white px-4 py-2 text-body-md text-ink placeholder:text-mist focus:outline-none focus:ring-1 focus:ring-gold"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-ivory disabled:opacity-40"
                aria-label="Send"
              >
                ↑
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bubble */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-ink shadow-lg hover:bg-ink/90 transition-colors"
        aria-label="Open Luna Stylist"
      >
        <span className="text-gold text-2xl">◑</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm --filter @e-luna/ui exec tsc --noEmit
```

---

## Task 6: Export All New Components

**Files:**
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Update index.ts**

```ts
export { RTLProvider, useRTL } from "./components/RTLProvider";
export { StatusBadge } from "./components/StatusBadge";
export { StatCard } from "./components/StatCard";
export { ProductCard } from "./components/ProductCard";
export { Notification } from "./components/Notification";
export { FilterBar } from "./components/FilterBar";
export { FilterDrawer } from "./components/FilterDrawer";
export type { FilterState } from "./components/FilterBar";
export { ProductGallery } from "./components/ProductGallery";
export { SizeSelector } from "./components/SizeSelector";
export { ChatMessage } from "./components/ChatMessage";
export { LunaChatWidget } from "./components/LunaChatWidget";
```

- [ ] **Step 2: Final TypeScript check**

```bash
pnpm --filter @e-luna/ui exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit everything**

```bash
git add packages/ui/
git commit -m "feat: add Phase 2 UI components (FilterBar, Gallery, SizeSelector, ChatMessage, LunaChatWidget)"
```

---

## Self-Check Before Handing Off to Plan 3

- [ ] `pnpm --filter @e-luna/ui exec tsc --noEmit` passes
- [ ] `pnpm lint` passes
- [ ] All 6 new components are exported from `packages/ui/src/index.ts`
