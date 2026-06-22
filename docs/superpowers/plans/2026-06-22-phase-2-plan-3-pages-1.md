# Phase 2 — Plan 3: Pages Part 1 (Home + Browse)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the customer app Nav, Home page, and Browse pages including the filter system and ProductGrid.

**Architecture:** RSC pages with client islands. Nav is a server component reading the cart cookie. Home page fetches all data in parallel via `Promise.all`. Browse page reads URL params server-side for initial render; FilterBar (client) handles subsequent filter changes via `router.replace`. ProductGrid and LoadMoreButton live in `apps/customer/components/` since they're app-specific.

**Tech Stack:** Next.js 15 App Router · React 19 · Tailwind CSS · Prisma · `@e-luna/db` · `@e-luna/ui`

**Dependency:** Run after Plan 1 (tokens) and Plan 2 (UI components).

---

## File Map

| File | Action |
|---|---|
| `apps/customer/app/layout.tsx` | Modify — add RTLProvider wrapper |
| `apps/customer/app/components/Nav.tsx` | Create |
| `apps/customer/app/components/Footer.tsx` | Create |
| `apps/customer/app/components/ProductGrid.tsx` | Create |
| `apps/customer/app/components/ProductGridSkeleton.tsx` | Create |
| `apps/customer/app/components/LoadMoreButton.tsx` | Create |
| `apps/customer/app/page.tsx` | Create — Home page |
| `apps/customer/app/browse/page.tsx` | Create — Browse page |
| `apps/customer/app/browse/[category]/page.tsx` | Create — Category browse |

---

## Task 1: Layout, Nav, Footer

**Files:**
- Modify: `apps/customer/app/layout.tsx`
- Create: `apps/customer/app/components/Nav.tsx`
- Create: `apps/customer/app/components/Footer.tsx`

- [ ] **Step 1: Create apps/customer/app/components/Nav.tsx**

```tsx
import { cookies } from "next/headers";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

type CartItem = { variantId: string; qty: number };

function getCartCount(): number {
  try {
    const cookieStore = cookies();
    const raw = cookieStore.get("luna_cart")?.value;
    if (!raw) return 0;
    const items: CartItem[] = JSON.parse(raw);
    return items.reduce((sum, item) => sum + item.qty, 0);
  } catch {
    return 0;
  }
}

export function Nav() {
  const cartCount = getCartCount();

  return (
    <header className="sticky top-0 z-30 border-b border-sand bg-ivory/95 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
        {/* Logo */}
        <Link href="/" className="font-display text-display-md font-bold tracking-widest text-ink">
          LUNA
        </Link>

        {/* Centre links — hidden on mobile */}
        <div className="hidden items-center gap-8 md:flex">
          <Link href="/browse" className="text-body-md text-ink hover:text-gold transition-colors">
            Browse
          </Link>
          <Link href="/browse?sort=newest" className="text-body-md text-ink hover:text-gold transition-colors">
            New Arrivals
          </Link>
          <Link href="/browse?sort=rating" className="text-body-md text-ink hover:text-gold transition-colors">
            Boutiques
          </Link>
        </div>

        {/* Right icons */}
        <div className="flex items-center gap-4">
          <Link href="/browse?q=" aria-label="Search" className="text-ink hover:text-gold transition-colors">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </Link>

          <SignedIn>
            <Link href="/wishlist" aria-label="Wishlist" className="text-ink hover:text-gold transition-colors">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </Link>

            <Link href="/cart" aria-label="Cart" className="relative text-ink hover:text-gold transition-colors">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-label font-bold text-ink">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Link>

            <UserButton afterSignOutUrl="/" />
          </SignedIn>

          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Create apps/customer/app/components/Footer.tsx**

```tsx
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-sand bg-ink mt-16">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <p className="font-display text-display-md font-bold tracking-widest text-ivory mb-4">
              LUNA
            </p>
            <p className="text-body-sm text-mist">
              The Gulf's AI-powered abaya marketplace
            </p>
          </div>
          <div>
            <h3 className="text-label uppercase text-gold mb-3">Shop</h3>
            <ul className="space-y-2 text-body-sm text-mist">
              <li><Link href="/browse?category=Occasion" className="hover:text-ivory transition-colors">Occasion</Link></li>
              <li><Link href="/browse?category=Everyday" className="hover:text-ivory transition-colors">Everyday</Link></li>
              <li><Link href="/browse?category=Travel" className="hover:text-ivory transition-colors">Travel</Link></li>
              <li><Link href="/browse?category=Sport" className="hover:text-ivory transition-colors">Sport</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-label uppercase text-gold mb-3">Luna</h3>
            <ul className="space-y-2 text-body-sm text-mist">
              <li><Link href="/chat" className="hover:text-ivory transition-colors">AI Stylist</Link></li>
              <li><Link href="/profile/size" className="hover:text-ivory transition-colors">Size Profile</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-label uppercase text-gold mb-3">Help</h3>
            <ul className="space-y-2 text-body-sm text-mist">
              <li><span className="cursor-default">Shipping & Returns</span></li>
              <li><span className="cursor-default">Size Guide</span></li>
              <li><Link href="https://sell.luna.ae" className="hover:text-ivory transition-colors">Sell on Luna</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-sand/30 pt-6 text-center text-body-sm text-mist">
          © 2026 Luna. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Update apps/customer/app/layout.tsx to include Nav, Footer, and RTLProvider**

```tsx
import type { Metadata } from "next";
import { Bodoni_Moda, Hanken_Grotesk, IBM_Plex_Sans_Arabic } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { RTLProvider } from "@e-luna/ui";
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
          </RTLProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
pnpm --filter @e-luna/customer exec tsc --noEmit
```

Expected: no errors.

---

## Task 2: ProductGrid + LoadMoreButton

These are app-specific RSC/client components used by both Browse and Vendor Boutique pages.

**Files:**
- Create: `apps/customer/app/components/ProductGrid.tsx`
- Create: `apps/customer/app/components/ProductGridSkeleton.tsx`
- Create: `apps/customer/app/components/LoadMoreButton.tsx`

- [ ] **Step 1: Create ProductGrid.tsx**

```tsx
import { prisma } from "@e-luna/db";
import { Decimal } from "@prisma/client/runtime/library";
import { ProductCard } from "@e-luna/ui";
import Link from "next/link";

export type ProductGridFilters = {
  category?: string;
  size?: string;
  fabric?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  q?: string;
  vendorId?: string;
  page?: string;
};

type Props = {
  filters: ProductGridFilters;
  customerSizeProfileUsualSize?: string | null;
};

const PAGE_SIZE = 12;

const SORT_MAP: Record<string, object> = {
  newest: { createdAt: "desc" },
  "price-asc": { price: "asc" },
  "price-desc": { price: "desc" },
  rating: { reviews: { _count: "desc" } },
};

export async function ProductGrid({ filters, customerSizeProfileUsualSize }: Props) {
  const page = Math.max(1, parseInt(filters.page ?? "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    status: "ACTIVE" as const,
    ...(filters.vendorId && { vendorId: filters.vendorId }),
    ...(filters.category && { category: { equals: filters.category, mode: "insensitive" as const } }),
    ...(filters.fabric && { fabric: { equals: filters.fabric, mode: "insensitive" as const } }),
    ...(filters.size && { variants: { some: { size: { equals: filters.size }, stock: { gt: 0 } } } }),
    ...(filters.minPrice && { price: { gte: new Decimal(filters.minPrice) } }),
    ...(filters.maxPrice && { price: { lte: new Decimal(filters.maxPrice) } }),
    ...(filters.q && {
      OR: [
        { title: { contains: filters.q, mode: "insensitive" as const } },
        { fabric: { contains: filters.q, mode: "insensitive" as const } },
        { description: { contains: filters.q, mode: "insensitive" as const } },
        { vendor: { storeName: { contains: filters.q, mode: "insensitive" as const } } },
      ],
    }),
  };

  const orderBy = SORT_MAP[filters.sort ?? "newest"] ?? { createdAt: "desc" };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take: PAGE_SIZE,
      include: {
        vendor: { select: { storeName: true, id: true } },
        variants: { select: { size: true, stock: true } },
        _count: { select: { reviews: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  if (products.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="text-body-lg text-ink mb-2">No abayas found</p>
        <p className="text-body-md text-mist mb-6">Luna hasn't found a match — try asking her</p>
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors"
        >
          <span className="text-gold">◑</span> Chat with Luna
        </Link>
      </div>
    );
  }

  const hasMore = skip + products.length < total;

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 px-4 py-6">
        {products.map((product) => {
          const firstImage = (product.aiImages as string[])[0] ?? null;
          const lowStockInYourSize =
            customerSizeProfileUsualSize &&
            product.variants.some(
              (v) => v.size === customerSizeProfileUsualSize && v.stock > 0 && v.stock <= 3
            );

          return (
            <Link key={product.id} href={`/p/${product.slug}`} className="block">
              <div className="relative">
                <ProductCard
                  id={product.id}
                  title={product.title}
                  price={Number(product.price)}
                  imageUrl={firstImage}
                  vendorName={product.vendor.storeName}
                />
                {lowStockInYourSize && (
                  <span className="absolute bottom-14 left-2 rounded bg-coral px-2 py-0.5 text-label text-ivory">
                    Low stock in your size
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {hasMore && (
        <div className="flex justify-center pb-8">
          {/* LoadMoreButton appends page=N to URL */}
          <LoadMoreButtonWrapper currentPage={page} total={total} loaded={skip + products.length} />
        </div>
      )}
    </div>
  );
}

// Thin wrapper to use the client LoadMoreButton inside this RSC
function LoadMoreButtonWrapper({ currentPage, total, loaded }: { currentPage: number; total: number; loaded: number }) {
  return (
    <div data-page={currentPage} data-total={total} data-loaded={loaded}>
      {/* Rendered by LoadMoreButton client component on browse page */}
    </div>
  );
}
```

- [ ] **Step 2: Create ProductGridSkeleton.tsx**

```tsx
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
```

- [ ] **Step 3: Create LoadMoreButton.tsx**

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type LoadMoreButtonProps = {
  currentPage: number;
  totalCount: number;
  loadedCount: number;
};

export function LoadMoreButton({ currentPage, totalCount, loadedCount }: LoadMoreButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (loadedCount >= totalCount) return null;

  function handleLoadMore() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(currentPage + 1));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <button
      onClick={handleLoadMore}
      className="rounded-full border border-sand px-8 py-3 text-body-md text-ink hover:bg-sand transition-colors"
    >
      Load more ({totalCount - loadedCount} remaining)
    </button>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
pnpm --filter @e-luna/customer exec tsc --noEmit
```

---

## Task 3: Home Page

**Files:**
- Create: `apps/customer/app/page.tsx`

- [ ] **Step 1: Create apps/customer/app/page.tsx**

```tsx
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@e-luna/db";
import { ProductCard } from "@e-luna/ui";
import { currentUser } from "@clerk/nextjs/server";

const CATEGORIES = [
  { label: "Occasion", slug: "Occasion", emoji: "✦" },
  { label: "Everyday", slug: "Everyday", emoji: "◌" },
  { label: "Travel", slug: "Travel", emoji: "◎" },
  { label: "Sport", slug: "Sport", emoji: "◈" },
];

const HERO_CAMPAIGN = {
  label: "New Season",
  heading: "Ramadan\nEvenings",
  cta: "SHOP NOW",
  href: "/browse?category=Occasion",
};

export default async function HomePage() {
  const user = await currentUser();

  const [categoryCounts, newArrivals, featuredBoutiques, sizeProfileStatus] = await Promise.all([
    // Category product counts
    Promise.all(
      CATEGORIES.map(async (cat) => ({
        ...cat,
        count: await prisma.product.count({
          where: { status: "ACTIVE", category: { equals: cat.slug, mode: "insensitive" } },
        }),
      }))
    ),

    // 6 newest active products
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { vendor: { select: { storeName: true } } },
    }),

    // 3 active boutiques
    prisma.vendor.findMany({
      where: { status: "ACTIVE" },
      take: 3,
      include: { _count: { select: { products: { where: { status: "ACTIVE" } } } } },
    }),

    // Size profile status for signed-in user
    user
      ? prisma.sizeProfile.findFirst({
          where: { customerProfile: { userId: user.id } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const hasSizeProfile = !!sizeProfileStatus;

  return (
    <div>
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative flex min-h-[70vh] items-end bg-ink px-6 pb-16 pt-8">
        <div className="relative z-10 max-w-xl">
          <p className="text-label uppercase tracking-widest text-gold mb-4">
            {HERO_CAMPAIGN.label}
          </p>
          <h1 className="font-display text-display-xl text-ivory whitespace-pre-line mb-8">
            {HERO_CAMPAIGN.heading}
          </h1>
          <Link
            href={HERO_CAMPAIGN.href}
            className="inline-block bg-gold px-8 py-3 text-label uppercase tracking-widest text-ink hover:bg-gold/90 transition-colors"
          >
            {HERO_CAMPAIGN.cta}
          </Link>
        </div>
      </section>

      {/* ── Categories ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <h2 className="font-display text-display-md text-ink mb-6">Shop by Style</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {categoryCounts.map((cat) => (
            <Link
              key={cat.slug}
              href={`/browse?category=${cat.slug}`}
              className="group flex flex-col items-center justify-center rounded-2xl bg-sand p-8 text-center hover:bg-gold/20 transition-colors"
            >
              <span className="text-2xl text-gold mb-2">{cat.emoji}</span>
              <span className="font-sans text-body-lg font-semibold text-ink">{cat.label}</span>
              <span className="text-body-sm text-mist mt-1">{cat.count} abayas</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── New Arrivals ───────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-display-md text-ink">New Arrivals</h2>
          <Link href="/browse?sort=newest" className="text-body-md text-gold hover:underline">
            View all
          </Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none">
          {newArrivals.map((product) => {
            const firstImage = (product.aiImages as string[])[0] ?? null;
            return (
              <Link
                key={product.id}
                href={`/p/${product.slug}`}
                className="shrink-0 w-48 md:w-56"
              >
                <ProductCard
                  id={product.id}
                  title={product.title}
                  price={Number(product.price)}
                  imageUrl={firstImage}
                  vendorName={product.vendor.storeName}
                />
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Featured Boutiques ─────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <h2 className="font-display text-display-md text-ink mb-6">Featured Boutiques</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {featuredBoutiques.map((vendor) => (
            <Link
              key={vendor.id}
              href={`/vendors/${vendor.id}`}
              className="group flex items-center gap-4 rounded-2xl border border-sand bg-ivory p-5 hover:border-gold transition-colors"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sand text-display-md font-bold text-ink group-hover:bg-gold/20 transition-colors">
                {vendor.storeName[0]}
              </div>
              <div>
                <p className="font-sans text-body-lg font-semibold text-ink">{vendor.storeName}</p>
                <p className="text-body-sm text-mist">
                  {vendor._count.products} abayas
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── AI Stylist Banner ──────────────────────────────────── */}
      {user && (
        <section className="bg-ink mx-4 my-8 rounded-2xl px-8 py-10 md:mx-6">
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-label uppercase tracking-widest text-gold mb-2">Luna AI Stylist</p>
              {hasSizeProfile ? (
                <h2 className="font-display text-display-md text-ivory">Your style, saved.</h2>
              ) : (
                <h2 className="font-display text-display-md text-ivory">
                  Luna knows your size.
                  <br />
                  Ask her anything.
                </h2>
              )}
            </div>
            <Link
              href="/chat"
              className="shrink-0 flex items-center gap-2 rounded-full border border-gold px-6 py-3 text-body-md font-medium text-gold hover:bg-gold hover:text-ink transition-colors"
            >
              <span>◑</span> Chat with Luna →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @e-luna/customer exec tsc --noEmit
```

---

## Task 4: Browse Pages

**Files:**
- Create: `apps/customer/app/browse/page.tsx`
- Create: `apps/customer/app/browse/[category]/page.tsx`

- [ ] **Step 1: Create apps/customer/app/browse/page.tsx**

```tsx
import { Suspense } from "react";
import { prisma } from "@e-luna/db";
import { FilterBar } from "@e-luna/ui";
import { currentUser } from "@clerk/nextjs/server";
import { ProductGrid } from "../components/ProductGrid";
import { ProductGridSkeleton } from "../components/ProductGridSkeleton";
import { LoadMoreButton } from "../components/LoadMoreButton";
import type { ProductGridFilters } from "../components/ProductGrid";

type BrowsePageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

function getString(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val;
}

export const metadata = {
  title: "Browse Abayas — Luna",
  description: "Discover hundreds of abayas from Gulf boutiques",
};

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const user = await currentUser();

  const filters: ProductGridFilters = {
    category: getString(searchParams.category),
    size: getString(searchParams.size),
    fabric: getString(searchParams.fabric),
    minPrice: getString(searchParams.minPrice),
    maxPrice: getString(searchParams.maxPrice),
    sort: getString(searchParams.sort),
    q: getString(searchParams.q),
    page: getString(searchParams.page),
  };

  // Get distinct values for filter drawer
  const [categories, fabrics, sizeProfile, totalCount] = await Promise.all([
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      select: { category: true },
      distinct: ["category"],
    }).then((rows) => rows.map((r) => r.category).sort()),

    prisma.product.findMany({
      where: { status: "ACTIVE", fabric: { not: null } },
      select: { fabric: true },
      distinct: ["fabric"],
    }).then((rows) => rows.map((r) => r.fabric!).sort()),

    user
      ? prisma.sizeProfile.findFirst({
          where: { customerProfile: { userId: user.id } },
          select: { usualSize: true },
        })
      : null,

    prisma.product.count({ where: { status: "ACTIVE" } }),
  ]);

  const page = Math.max(1, parseInt(filters.page ?? "1", 10));
  const loadedCount = page * 12;

  return (
    <div>
      {/* Search input (top of page, above FilterBar) */}
      {filters.q && (
        <div className="bg-sand px-4 py-3 text-body-md text-ink">
          Results for <strong>"{filters.q}"</strong>
        </div>
      )}

      <FilterBar
        categories={categories}
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
            loadedCount={Math.min(loadedCount, totalCount)}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create apps/customer/app/browse/[category]/page.tsx**

This is a thin wrapper — it pre-populates the category filter.

```tsx
import { notFound } from "next/navigation";
import BrowsePage from "../page";

const VALID_CATEGORIES = ["occasion", "everyday", "travel", "sport"];

type Props = {
  params: { category: string };
  searchParams: Record<string, string | string[] | undefined>;
};

export async function generateMetadata({ params }: Props) {
  const label = params.category.charAt(0).toUpperCase() + params.category.slice(1);
  return {
    title: `${label} Abayas — Luna`,
    description: `Browse ${label.toLowerCase()} abayas from Gulf boutiques`,
  };
}

export default function CategoryBrowsePage({ params, searchParams }: Props) {
  if (!VALID_CATEGORIES.includes(params.category.toLowerCase())) {
    notFound();
  }

  const categoryLabel = params.category.charAt(0).toUpperCase() + params.category.slice(1);

  return (
    <BrowsePage
      searchParams={{ ...searchParams, category: categoryLabel }}
    />
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm --filter @e-luna/customer exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/customer/
git commit -m "feat: add Nav, Footer, Home page, and Browse pages"
```

---

## Self-Check Before Handing Off to Plan 4

- [ ] `pnpm --filter @e-luna/customer exec tsc --noEmit` passes
- [ ] `pnpm lint` passes
- [ ] Run `pnpm dev` and open `http://localhost:3000` — home page loads with category tiles and new arrivals (needs seed data from Plan 1)
- [ ] Open `http://localhost:3000/browse` — filter bar shows, products load in 4-column grid
- [ ] Open `http://localhost:3000/browse/occasion` — pre-filtered to Occasion category
