# Phase 2 — Plan 4: Pages Part 2 (PDP, Boutique, AI Chat)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Product Detail page, Vendor Boutique page, the AI Stylist full page, the `/api/chat` route handler, and integrate the LunaChatWidget into the layout.

**Architecture:** Product detail uses RSC for content with client islands for gallery and size picker. Cart is a signed cookie (`luna_cart`) — a Server Action appends items. The chat route handler streams from `runShoppingAgent`. The full `/chat` page uses `useChat` + a `ChatInterface` client component. The `LunaChatWidget` in the root layout points to `/api/chat`.

**Tech Stack:** Next.js 15 App Router · Prisma · Vercel AI SDK `useChat` · `@e-luna/ai` · cookies API · `@e-luna/ui`

**Dependency:** Run after Plans 1, 2, and 3.

---

## File Map

| File | Action |
|---|---|
| `apps/customer/package.json` | Modify — add `@e-luna/ai` + `ai` deps |
| `apps/customer/app/actions/cart.ts` | Create — Server Action for cart cookie |
| `apps/customer/app/p/[slug]/page.tsx` | Create — Product Detail page |
| `apps/customer/app/p/[slug]/ProductDetail.tsx` | Create — client island |
| `apps/customer/app/vendors/[id]/page.tsx` | Create — Vendor Boutique page |
| `apps/customer/app/api/chat/route.ts` | Create — streaming chat route handler |
| `apps/customer/app/chat/page.tsx` | Create — AI Stylist full page |
| `apps/customer/app/chat/ChatInterface.tsx` | Create — client chat component |
| `apps/customer/app/layout.tsx` | Modify — add LunaChatWidget |

---

## Task 1: Add AI Dependencies

**Files:**
- Modify: `apps/customer/package.json`

- [ ] **Step 1: Update apps/customer/package.json**

```json
{
  "name": "@e-luna/customer",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@clerk/nextjs": "^5.0.0",
    "@e-luna/ai": "workspace:*",
    "@e-luna/auth": "workspace:*",
    "@e-luna/db": "workspace:*",
    "@e-luna/ui": "workspace:*",
    "ai": "^4.3.19",
    "next": "15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@e-luna/config": "workspace:*",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

---

## Task 2: Cart Server Action

**Files:**
- Create: `apps/customer/app/actions/cart.ts`

- [ ] **Step 1: Create apps/customer/app/actions/cart.ts**

```ts
"use server";

import { cookies } from "next/headers";

const CART_COOKIE = "luna_cart";
const MAX_ITEMS = 20;

export type CartItem = {
  variantId: string;
  qty: number;
  addedAt: string;
};

export function getCart(): CartItem[] {
  try {
    const raw = cookies().get(CART_COOKIE)?.value;
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}

export async function addToCart(variantId: string, qty: number = 1): Promise<{ success: boolean; message: string }> {
  try {
    const cart = getCart();
    const existing = cart.find((item) => item.variantId === variantId);

    if (existing) {
      existing.qty += qty;
    } else {
      if (cart.length >= MAX_ITEMS) {
        return { success: false, message: "Your bag is full (20 items max)" };
      }
      cart.push({ variantId, qty, addedAt: new Date().toISOString() });
    }

    cookies().set(CART_COOKIE, JSON.stringify(cart), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: "lax",
      httpOnly: false, // Nav needs client-side read for count badge
    });

    return { success: true, message: "Added to bag" };
  } catch {
    return { success: false, message: "Could not add to bag. Please try again." };
  }
}
```

---

## Task 3: Product Detail Page

**Files:**
- Create: `apps/customer/app/p/[slug]/page.tsx`
- Create: `apps/customer/app/p/[slug]/ProductDetail.tsx`

- [ ] **Step 1: Create apps/customer/app/p/[slug]/ProductDetail.tsx**

This is the client island — handles size selection, add to cart, gallery interaction.

```tsx
"use client";

import { useState } from "react";
import { ProductGallery, SizeSelector } from "@e-luna/ui";
import type { SizeProfile } from "@e-luna/db";
import { addToCart } from "../../actions/cart";

type Variant = {
  id: string;
  size: string;
  color: string;
  stock: number;
};

type ProductDetailProps = {
  productSlug: string;
  images: string[];
  title: string;
  price: number;
  fabric: string | null;
  sizeGuide: {
    entries: { size: string; bust: [number, number]; waist: [number, number]; hip: [number, number]; length: number }[];
  } | null;
  variants: Variant[];
  sizeProfile: Pick<SizeProfile, "usualSize" | "bust" | "fitPreference"> | null;
  recommendedSize: string | null;
};

export function ProductDetail({
  productSlug,
  images,
  title,
  price,
  fabric,
  sizeGuide,
  variants,
  sizeProfile,
  recommendedSize,
}: ProductDetailProps) {
  const [selectedSize, setSelectedSize] = useState<string | null>(recommendedSize ?? null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [wishlisted, setWishlisted] = useState(false);

  const variantStocks = variants.map((v) => ({
    size: v.size,
    stock: v.stock,
    variantId: v.id,
  }));

  async function handleAddToBag() {
    if (!selectedVariantId || adding) return;
    setAdding(true);
    const result = await addToCart(selectedVariantId, 1);
    setAddedMessage(result.message);
    setAdding(false);
    setTimeout(() => setAddedMessage(null), 3000);
  }

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      {/* Gallery */}
      <ProductGallery images={images} title={title} />

      {/* Info */}
      <div className="flex flex-col gap-6 py-2">
        <div>
          <p className="font-sans text-body-md font-semibold text-gold">
            AED {price.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <h1 className="font-display text-display-md text-ink mt-1">{title}</h1>
          {fabric && (
            <span className="mt-2 inline-block rounded-full border border-sand px-3 py-1 text-body-sm text-mist">
              {fabric}
            </span>
          )}
        </div>

        {/* Size selector */}
        <SizeSelector
          variants={variantStocks}
          selectedSize={selectedSize}
          recommendedSize={recommendedSize ?? undefined}
          onSelect={(size, variantId) => {
            setSelectedSize(size);
            setSelectedVariantId(variantId);
          }}
        />

        {/* Luna Fit strip */}
        {sizeProfile ? (
          recommendedSize ? (
            <div className="rounded-xl bg-ink px-4 py-3 text-body-sm text-ivory">
              <span className="text-gold">◑</span> Luna thinks{" "}
              <strong>{recommendedSize}</strong> fits you well based on your measurements.
            </div>
          ) : null
        ) : (
          <div className="rounded-xl border border-sand px-4 py-3 text-body-sm text-mist">
            <a href="/profile/size" className="text-gold underline">
              Add your measurements
            </a>{" "}
            for a personalised size recommendation.
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleAddToBag}
            disabled={!selectedVariantId || adding}
            className="flex-1 rounded-full bg-ink py-4 text-body-md font-semibold text-ivory transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {adding ? "Adding…" : addedMessage ?? "Add to Bag"}
          </button>

          <button
            onClick={() => setWishlisted((prev) => !prev)}
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-sand text-coral hover:bg-sand transition-colors"
          >
            {wishlisted ? "♥" : "♡"}
          </button>
        </div>

        {/* Size guide accordion */}
        {sizeGuide?.entries?.length ? (
          <details className="group">
            <summary className="cursor-pointer list-none border-t border-sand pt-4 text-body-md font-medium text-ink">
              Size guide{" "}
              <span className="text-mist group-open:hidden">+</span>
              <span className="text-mist hidden group-open:inline">−</span>
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-sand text-left text-label uppercase text-mist">
                    <th className="py-2 pr-4">Size</th>
                    <th className="py-2 pr-4">Bust (cm)</th>
                    <th className="py-2 pr-4">Waist (cm)</th>
                    <th className="py-2 pr-4">Hip (cm)</th>
                    <th className="py-2">Length (cm)</th>
                  </tr>
                </thead>
                <tbody>
                  {sizeGuide.entries.map((entry) => (
                    <tr key={entry.size} className={`border-b border-sand/50 ${selectedSize === entry.size ? "bg-gold/10" : ""}`}>
                      <td className="py-2 pr-4 font-medium text-ink">{entry.size}</td>
                      <td className="py-2 pr-4 text-mist">{entry.bust[0]}–{entry.bust[1]}</td>
                      <td className="py-2 pr-4 text-mist">{entry.waist[0]}–{entry.waist[1]}</td>
                      <td className="py-2 pr-4 text-mist">{entry.hip[0]}–{entry.hip[1]}</td>
                      <td className="py-2 text-mist">{entry.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create apps/customer/app/p/[slug]/page.tsx**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { ProductCard } from "@e-luna/ui";
import { currentUser } from "@clerk/nextjs/server";
import { ProductDetail } from "./ProductDetail";
import type { Metadata } from "next";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: { vendor: { select: { storeName: true } } },
  });
  if (!product) return { title: "Not Found" };
  return {
    title: `${product.title} — ${product.vendor.storeName} on Luna`,
    description: product.description ?? undefined,
  };
}

type SizeGuideJson = {
  entries: { size: string; bust: [number, number]; waist: [number, number]; hip: [number, number]; length: number }[];
};

export default async function ProductDetailPage({ params }: Props) {
  const user = await currentUser();

  const [product, sizeProfile] = await Promise.all([
    prisma.product.findUnique({
      where: { slug: params.slug },
      include: {
        vendor: { select: { id: true, storeName: true } },
        variants: { select: { id: true, size: true, color: true, stock: true } },
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { customerProfile: { select: { user: { select: { email: true } } } } },
        },
        _count: { select: { reviews: true } },
      },
    }),
    user
      ? prisma.sizeProfile.findFirst({
          where: { customerProfile: { userId: user.id } },
          select: { bust: true, usualSize: true, fitPreference: true },
        })
      : null,
  ]);

  if (!product || product.status !== "ACTIVE") notFound();

  // Calculate average rating
  const avgRating =
    product.reviews.length > 0
      ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length
      : null;

  // Recommend size from sizeGuide
  let recommendedSize: string | null = null;
  if (sizeProfile?.bust) {
    const guide = product.sizeGuide as SizeGuideJson;
    const match = guide?.entries?.find(
      (e) => sizeProfile.bust! >= e.bust[0] && sizeProfile.bust! < e.bust[1]
    );
    if (match) {
      recommendedSize = match.size;
      if (sizeProfile.fitPreference === "LOOSE" || sizeProfile.fitPreference === "OVERSIZED") {
        const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL"];
        const idx = sizeOrder.indexOf(match.size);
        if (idx < sizeOrder.length - 1) recommendedSize = sizeOrder[idx + 1];
      }
    }
  }

  // More from same vendor
  const moreFromVendor = await prisma.product.findMany({
    where: { vendorId: product.vendorId, status: "ACTIVE", id: { not: product.id } },
    take: 4,
    orderBy: { createdAt: "desc" },
    include: { vendor: { select: { storeName: true } } },
  });

  const images = product.aiImages as string[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-body-sm text-mist">
        <Link href="/browse" className="hover:text-gold transition-colors">Browse</Link>
        <span>/</span>
        <Link href={`/browse?category=${product.category}`} className="hover:text-gold transition-colors">
          {product.category}
        </Link>
        <span>/</span>
        <span className="text-ink truncate">{product.title}</span>
      </nav>

      {/* Vendor badge */}
      <Link
        href={`/vendors/${product.vendor.id}`}
        className="mb-4 inline-flex items-center gap-1 rounded-full border border-sand px-3 py-1 text-body-sm text-mist hover:border-gold hover:text-gold transition-colors"
      >
        {product.vendor.storeName} →
      </Link>

      {/* Main product detail (client island) */}
      <ProductDetail
        productSlug={product.slug}
        images={images}
        title={product.title}
        price={Number(product.price)}
        fabric={product.fabric}
        sizeGuide={product.sizeGuide as SizeGuideJson}
        variants={product.variants}
        sizeProfile={sizeProfile ?? null}
        recommendedSize={recommendedSize}
      />

      {/* Reviews */}
      {product._count.reviews > 0 && (
        <section className="mt-16 border-t border-sand pt-10">
          <div className="mb-6 flex items-center gap-4">
            <h2 className="font-display text-display-md text-ink">Reviews</h2>
            {avgRating !== null && (
              <span className="text-body-md text-mist">
                {"★".repeat(Math.round(avgRating))}{"☆".repeat(5 - Math.round(avgRating))}{" "}
                {avgRating.toFixed(1)} ({product._count.reviews})
              </span>
            )}
          </div>
          <div className="space-y-6">
            {product.reviews.map((review) => (
              <div key={review.id} className="border-b border-sand pb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-body-sm font-medium text-ink">
                    {review.customerProfile.user.email.split("@")[0]}
                  </span>
                  <span className="text-body-sm text-gold">
                    {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                  </span>
                </div>
                {review.body && <p className="text-body-md text-mist">{review.body}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* More from vendor */}
      {moreFromVendor.length > 0 && (
        <section className="mt-16 border-t border-sand pt-10">
          <h2 className="font-display text-display-md text-ink mb-6">
            More from {product.vendor.storeName}
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {moreFromVendor.map((p) => {
              const img = (p.aiImages as string[])[0] ?? null;
              return (
                <Link key={p.id} href={`/p/${p.slug}`}>
                  <ProductCard
                    id={p.id}
                    title={p.title}
                    price={Number(p.price)}
                    imageUrl={img}
                    vendorName={p.vendor.storeName}
                  />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm --filter @e-luna/customer exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/customer/app/p/ apps/customer/app/actions/
git commit -m "feat: add product detail page with size selector and add-to-cart"
```

---

## Task 4: Vendor Boutique Page

**Files:**
- Create: `apps/customer/app/vendors/[id]/page.tsx`

- [ ] **Step 1: Create apps/customer/app/vendors/[id]/page.tsx**

```tsx
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@e-luna/db";
import { FilterBar } from "@e-luna/ui";
import { currentUser } from "@clerk/nextjs/server";
import { ProductGrid } from "../../components/ProductGrid";
import { ProductGridSkeleton } from "../../components/ProductGridSkeleton";
import { LoadMoreButton } from "../../components/LoadMoreButton";
import type { Metadata } from "next";
import type { ProductGridFilters } from "../../components/ProductGrid";

type Props = {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
};

function getString(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const vendor = await prisma.vendor.findUnique({ where: { id: params.id } });
  if (!vendor) return { title: "Not Found" };
  return {
    title: `${vendor.storeName} — Luna`,
    description: `Shop abayas from ${vendor.storeName} on Luna`,
  };
}

export default async function VendorBoutiquePage({ params, searchParams }: Props) {
  const user = await currentUser();

  const vendor = await prisma.vendor.findUnique({
    where: { id: params.id },
    include: {
      _count: {
        select: {
          products: { where: { status: "ACTIVE" } },
        },
      },
    },
  });

  if (!vendor || vendor.status !== "ACTIVE") notFound();

  const [avgRating, fabrics, sizeProfile] = await Promise.all([
    prisma.review.aggregate({
      where: { product: { vendorId: vendor.id } },
      _avg: { rating: true },
      _count: { rating: true },
    }),

    prisma.product.findMany({
      where: { vendorId: vendor.id, status: "ACTIVE", fabric: { not: null } },
      select: { fabric: true },
      distinct: ["fabric"],
    }).then((rows) => rows.map((r) => r.fabric!).sort()),

    user
      ? prisma.sizeProfile.findFirst({
          where: { customerProfile: { userId: user.id } },
          select: { usualSize: true },
        })
      : null,
  ]);

  const filters: ProductGridFilters = {
    size: getString(searchParams.size),
    fabric: getString(searchParams.fabric),
    minPrice: getString(searchParams.minPrice),
    maxPrice: getString(searchParams.maxPrice),
    sort: getString(searchParams.sort),
    page: getString(searchParams.page),
    vendorId: vendor.id,
  };

  const totalCount = await prisma.product.count({
    where: { vendorId: vendor.id, status: "ACTIVE" },
  });

  const page = Math.max(1, parseInt(filters.page ?? "1", 10));

  // Year vendor joined
  const joinedYear = vendor.createdAt.getFullYear();

  return (
    <div>
      {/* Boutique header */}
      <div className="bg-ink px-4 pb-8 pt-12 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-end gap-6">
            {/* Logo placeholder */}
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-ivory/10 text-display-lg font-bold text-ivory">
              {vendor.storeName[0]}
            </div>
            <div>
              <h1 className="font-display text-display-lg text-ivory">{vendor.storeName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-body-sm text-mist">
                <span className="text-gold">{vendor._count.products} abayas</span>
                {avgRating._count.rating > 0 && (
                  <span>
                    {"★".repeat(Math.round(avgRating._avg.rating ?? 0))} {avgRating._avg.rating?.toFixed(1)} ({avgRating._count.rating} reviews)
                  </span>
                )}
                <span>Since {joinedYear}</span>
              </div>
            </div>
          </div>
          {vendor.description && (
            <p className="mt-4 max-w-2xl text-body-md text-mist/80">{vendor.description}</p>
          )}
        </div>
      </div>

      {/* Filter bar — no category filter for single vendor */}
      <FilterBar
        fabrics={fabrics}
        totalCount={totalCount}
      />

      <div className="mx-auto max-w-7xl">
        <Suspense fallback={<ProductGridSkeleton />}>
          <ProductGrid
            filters={filters}
            customerSizeProfileUsualSize={sizeProfile?.usualSize ?? null}
          />
        </Suspense>

        <div className="flex justify-center pb-10">
          <LoadMoreButton
            currentPage={page}
            totalCount={totalCount}
            loadedCount={Math.min(page * 12, totalCount)}
          />
        </div>
      </div>

      {/* About section */}
      <section className="mx-auto max-w-7xl border-t border-sand px-4 py-10 md:px-6">
        <h2 className="font-display text-display-md text-ink mb-4">About {vendor.storeName}</h2>
        <p className="text-body-md text-mist max-w-2xl">
          {vendor.description ?? "This boutique is currently setting up their story. Check back soon."}
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-sand p-4 max-w-sm">
          <span className="text-gold">◑</span>
          <p className="text-body-sm text-mist">
            Standard platform return policy applies to all Luna boutiques.
          </p>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @e-luna/customer exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/customer/app/vendors/
git commit -m "feat: add vendor boutique page"
```

---

## Task 5: Chat Route Handler

**Files:**
- Create: `apps/customer/app/api/chat/route.ts`

- [ ] **Step 1: Create apps/customer/app/api/chat/route.ts**

```ts
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@e-luna/db";
import { runShoppingAgent } from "@e-luna/ai/shopping";
import type { CoreMessage } from "ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, sessionId } = await req.json() as {
    messages: CoreMessage[];
    sessionId?: string;
  };

  // Fetch size profile for context injection
  const sizeProfile = await prisma.sizeProfile.findFirst({
    where: { customerProfile: { userId: user.id } },
  });

  // Persist / update AISession
  const session = sessionId
    ? await prisma.aISession.findFirst({ where: { id: sessionId, userId: user.id } })
    : null;

  const activeSessionId = session?.id ?? (
    await prisma.aISession.create({
      data: {
        userId: user.id,
        agentType: "SHOPPING",
        messages: messages,
        context: sizeProfile
          ? {
              bust: sizeProfile.bust,
              usualSize: sizeProfile.usualSize,
              fitPreference: sizeProfile.fitPreference,
            }
          : {},
      },
    })
  ).id;

  // Stream from Shopping Agent
  const result = await runShoppingAgent(messages, { sizeProfile });

  // Update session messages in the background (fire and forget)
  result.text.then(async () => {
    await prisma.aISession.update({
      where: { id: activeSessionId },
      data: { messages: messages, updatedAt: new Date() },
    });
  }).catch(() => {
    // Non-critical — session persistence failure should not break chat
  });

  return result.toDataStreamResponse({
    headers: { "x-session-id": activeSessionId },
  });
}
```

---

## Task 6: AI Stylist Full Page

**Files:**
- Create: `apps/customer/app/chat/page.tsx`
- Create: `apps/customer/app/chat/ChatInterface.tsx`

- [ ] **Step 1: Create apps/customer/app/chat/ChatInterface.tsx**

```tsx
"use client";

import { useChat } from "ai/react";
import { useEffect, useRef, useState } from "react";
import type { Message } from "ai";
import { ChatMessage } from "@e-luna/ui";

const STARTER_PROMPTS = [
  "I'm looking for an abaya for a wedding next week",
  "What's a good everyday abaya for Dubai weather?",
  "I need something for travelling, easy to pack",
  "Show me sport abayas",
];

export function ChatInterface() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  const { messages, input, handleInputChange, handleSubmit, append, isLoading, setMessages } = useChat({
    api: "/api/chat",
    body: { sessionId },
    onResponse: (response) => {
      const sid = response.headers.get("x-session-id");
      if (sid && !sessionId) setSessionId(sid);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleClear() {
    setMessages([]);
    setSessionId(undefined);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-sand px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink">
            <span className="text-gold text-lg">◑</span>
          </div>
          <div>
            <h2 className="font-sans text-body-lg font-semibold text-ink">Luna AI Stylist</h2>
            <p className="text-body-sm text-mist">Your personal style advisor</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="text-body-sm text-mist hover:text-ink transition-colors"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center pt-12 text-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink">
              <span className="text-gold text-3xl">◑</span>
            </div>
            <div>
              <h3 className="font-display text-display-md text-ink mb-2">مرحباً! I'm Luna.</h3>
              <p className="text-body-md text-mist">Tell me your occasion and I'll find your perfect abaya.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm sm:grid-cols-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => append({ role: "user", content: prompt })}
                  className="rounded-xl border border-sand px-4 py-3 text-body-sm text-ink text-left hover:bg-sand transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m: Message) => (
            <ChatMessage key={m.id} role={m.role as "user" | "assistant"} content={m.content} />
          ))
        )}

        {isLoading && (
          <div className="flex justify-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-gold">◑</div>
            <div className="rounded-2xl rounded-bl-sm bg-sand px-4 py-3 text-body-sm text-mist animate-pulse">
              Luna is thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-sand p-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask Luna about abayas, sizes, fabrics…"
            className="flex-1 rounded-full border border-sand bg-white px-5 py-3 text-body-md text-ink placeholder:text-mist focus:outline-none focus:ring-1 focus:ring-gold"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-ivory disabled:opacity-40 hover:bg-ink/90 transition-colors"
            aria-label="Send"
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create apps/customer/app/chat/page.tsx**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@e-luna/db";
import Link from "next/link";
import { ChatInterface } from "./ChatInterface";

export const metadata = {
  title: "Luna AI Stylist — luna.ae",
  description: "Chat with Luna, your AI fashion advisor for the perfect abaya",
};

export default async function ChatPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sizeProfile = await prisma.sizeProfile.findFirst({
    where: { customerProfile: { userId } },
    select: { usualSize: true },
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] max-w-7xl mx-auto">
      {/* Left: Chat */}
      <div className="flex flex-1 flex-col border-r border-sand">
        <ChatInterface />
      </div>

      {/* Right: Context panel (desktop only) */}
      <div className="hidden w-80 flex-col gap-6 overflow-y-auto p-6 md:flex">
        <div>
          <h3 className="text-label uppercase text-mist mb-3">Your Profile</h3>
          {sizeProfile ? (
            <div className="rounded-xl border border-sand bg-ivory p-4">
              <p className="text-body-sm text-ink font-medium">Size {sizeProfile.usualSize}</p>
              <p className="text-body-sm text-mist mt-1">Luna will recommend products that fit you.</p>
              <Link href="/profile/size" className="mt-3 block text-body-sm text-gold hover:underline">
                Update measurements →
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-sand bg-ivory p-4 text-center">
              <span className="text-2xl text-gold block mb-2">◑</span>
              <p className="text-body-sm text-mist mb-3">Add your measurements so Luna can recommend the right size.</p>
              <Link
                href="/profile/size"
                className="text-body-sm font-medium text-gold hover:underline"
              >
                Set up size profile →
              </Link>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-label uppercase text-mist mb-3">Quick Browse</h3>
          <div className="space-y-2">
            {["Occasion", "Everyday", "Travel", "Sport"].map((cat) => (
              <Link
                key={cat}
                href={`/browse?category=${cat}`}
                className="block rounded-lg border border-sand px-3 py-2 text-body-sm text-ink hover:border-gold hover:text-gold transition-colors"
              >
                {cat} →
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm --filter @e-luna/customer exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/customer/app/api/ apps/customer/app/chat/
git commit -m "feat: add AI Stylist chat route handler and full page"
```

---

## Task 7: Wire LunaChatWidget into Layout

**Files:**
- Modify: `apps/customer/app/layout.tsx`

- [ ] **Step 1: Add LunaChatWidget to layout.tsx**

```tsx
import type { Metadata } from "next";
import { Bodoni_Moda, Hanken_Grotesk, IBM_Plex_Sans_Arabic } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { RTLProvider, LunaChatWidget } from "@e-luna/ui";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";
import "./globals.css";

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-bodoni",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const ibmArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Luna — The Gulf's AI-powered abaya marketplace",
  description: "Discover abayas styled for you by AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" dir="ltr" className={`${bodoni.variable} ${hanken.variable} ${ibmArabic.variable}`}>
        <body className="bg-ivory font-sans text-ink antialiased">
          <RTLProvider>
            <Nav />
            <main>{children}</main>
            <Footer />
            {/* Widget hides itself on /chat via usePathname() */}
            <LunaChatWidget apiPath="/api/chat" />
          </RTLProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 2: Final TypeScript check across all packages**

```bash
pnpm --filter @e-luna/customer exec tsc --noEmit
pnpm --filter @e-luna/ui exec tsc --noEmit
pnpm --filter @e-luna/ai exec tsc --noEmit
pnpm lint
```

All expected to pass with no errors.

- [ ] **Step 3: Smoke test**

```bash
pnpm dev
```

Check:
1. `http://localhost:3000` — home page loads, categories show with counts (requires seed from Plan 1)
2. `http://localhost:3000/browse` — filter bar appears, 4-col grid shows products
3. `http://localhost:3000/browse/occasion` — pre-filtered to Occasion
4. `http://localhost:3000/p/nidaa-signature-crepe-abaya` — product detail loads, size selector shows
5. `http://localhost:3000/vendors/<nidaa-vendor-id>` — boutique header and product grid
6. `http://localhost:3000/chat` — chat interface loads, Luna widget NOT shown (hidden on /chat)
7. Navigate to `/browse` — Luna chat bubble appears bottom-right, click expands panel

- [ ] **Step 4: Final commit**

```bash
git add apps/customer/app/layout.tsx
git commit -m "feat: wire LunaChatWidget into customer app layout"
```

---

## Self-Check — Phase 2 Complete

- [ ] All 4 plans committed
- [ ] `pnpm lint` passes
- [ ] `pnpm --filter "@e-luna/*" exec tsc --noEmit` passes
- [ ] Seed ran successfully (Plan 1)
- [ ] All 6 routes render without errors
- [ ] Luna chat widget streams real AI responses
- [ ] Filter bar updates URL and re-renders product grid
- [ ] Add to Bag button writes cart cookie (check DevTools → Application → Cookies → `luna_cart`)
