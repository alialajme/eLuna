# Phase 2: Customer Storefront — Design Spec

**Date:** 2026-06-22  
**Phase:** 2 of 8  
**App:** `apps/customer` (luna.ae)  
**Status:** Approved — ready for implementation planning

---

## Overview

Phase 2 builds the customer-facing storefront for luna.ae: home page, browse/search, product detail, vendor boutique pages, and the Luna AI Stylist (full page + persistent floating widget). The AI Stylist is fully wired — real streaming Claude calls with Prisma-backed tool implementations and size profile context injection.

Phase 2 does **not** include: cart page, checkout, Luna Pay, size profile editor, wishlist page, orders, wallet, vendor OS, real AI image generation, or full-text search. These are deferred to Phases 3–8.

---

## Decisions Made

| Decision | Choice | Reason |
|---|---|---|
| AI Stylist completeness | Fully wired | Real Prisma queries in tools, size profile injected, streaming |
| Seed data | Prisma seed script | `pnpm db:seed` — enables browse/search/AI to return real results |
| Homepage layout | Editorial Luxury | Full-width hero + category tiles + featured products |
| Color palette | Warm Oud | Deep espresso + warm cream + antique gold — replaces Moonlit navy |
| Browse layout | Top filter pills + 4-column grid | Mobile-first, no sidebar needed |
| Data fetching strategy | Hybrid RSC + client state | URL-driven filters, RSC product grid, client for interactivity |

---

## Design System Update — Warm Oud Palette

**File:** `packages/config/tailwind/index.ts`

| Token | Old (Moonlit) | New (Warm Oud) |
|---|---|---|
| `ink` | `#1a1a2e` | `#1a0a00` |
| `ivory` | `#fdf9f4` | `#fff8ee` |
| `sand` | `#e8d9c4` | `#f0e8d8` |
| `gold` | `#c9a96e` | `#d4a855` |

Unchanged: Lilac `#c4a0f0`, Sage `#6dbf8e`, Coral `#e57373`, Mist `#888888`.

All Phase 1 components (`ProductCard`, `StatusBadge`, `StatCard`, `Notification`, `RTLProvider`) use Tailwind token classes and automatically inherit the new palette. No component rewrites needed.

---

## Architecture

### RSC / Client Boundaries

| Layer | Rendering | Reason |
|---|---|---|
| Page shells, nav, footer | RSC | No interactivity |
| Product grids, page content | RSC + Suspense | Server-fetched, SEO-critical |
| Filter pills, sort dropdown | Client (`"use client"`) | URL-synced via `useSearchParams` |
| Image gallery, size picker | Client | Local UI state |
| AI chat widget + full page | Client | Streaming via `useChat` |

### Filter URL Schema

All filter state lives in URL search params — bookmarkable, shareable, SEO-indexed:

```
/browse?category=occasion&size=M&fabric=crepe&minPrice=200&maxPrice=1200&sort=newest&page=1
```

Filter changes use `router.replace()` (not `push`) so the back button skips intermediate filter states.

### Data Fetching Pattern

1. RSC reads search params server-side → Prisma query → renders initial grid
2. Customer changes filter → client `useSearchParams` updates URL → Next.js re-renders the RSC segment
3. Suspense boundary shows skeleton cards during fetch
4. Size profile fetched once server-side, passed as prop to components that need it

### AI Chat Data Flow

1. Client calls Server Action `chatAction(messages, sessionId)`
2. Server Action fetches customer's `SizeProfile` via Clerk user ID
3. `runShoppingAgent(messages, { sizeProfile, sessionId })` called — streams via Vercel AI SDK
4. Tool calls execute server-side inside the agent:
   - `search_products` → Prisma query
   - `recommend_size` → sizeProfile vs product.sizeGuide JSON comparison
   - `add_to_cart` → appends to cart cookie
   - `style_look` → rule-based complementary product lookup
5. `[PRODUCT:slug]` tokens in stream → client renders inline `ProductCard`
6. Conversation persisted to `AISession` table after each turn

---

## Seed Data

**File:** `packages/db/prisma/seed.ts`  
**Command:** `pnpm db:seed`  
**Behavior:** idempotent (`upsert` on email/slug)

### Boutiques (3)
- **Nidaa Studio** — Occasion & formal, Dubai
- **Lomar** — Everyday & travel, Riyadh
- **Bashaer** — Sport & modest activewear, Abu Dhabi

### Products (15 — 5 per boutique)
- 4 categories: Occasion, Everyday, Travel, Sport
- Fabrics: Crepe, Silk, Nidha, Jersey, Linen
- Sizes: XS–XXL per variant, varied stock
- Price range: AED 220–1,800
- Realistic Arabic/Gulf product names, English slugs

### Customers (2 with size profiles)
- Petite profile: height 155cm, bust 86cm — exercises `recommend_size`
- Standard profile: height 165cm, bust 96cm

### Supporting data
- 1 address per customer (Dubai / Abu Dhabi)
- 6 reviews spread across products
- 1 wishlist item per customer

### Package.json scripts added
- Root `package.json`: `"db:seed": "turbo run db:seed --filter=@e-luna/db"`
- `packages/db/package.json`: `"db:seed": "tsx prisma/seed.ts"`

---

## New UI Components

### `packages/ui/src/components/` (shared across apps)

| Component | Purpose |
|---|---|
| `LunaChatWidget.tsx` | Floating bubble + slide-up panel (bottom-right, all pages) |
| `ChatMessage.tsx` | Message bubble with inline `ProductCard` embed support |
| `ProductGallery.tsx` | Main image + thumbnail strip, pinch-to-zoom on mobile |
| `SizeSelector.tsx` | Size grid with stock states, AI recommendation highlight |
| `FilterBar.tsx` | Horizontal scrollable filter pill row + sort dropdown |
| `FilterDrawer.tsx` | Bottom-sheet drawer with full filter controls |

### `apps/customer/components/` (customer app only)

| Component | Purpose |
|---|---|
| `ProductGrid.tsx` | RSC product grid — used by `/browse` and `/vendors/[id]` |
| `LoadMoreButton.tsx` | Client button that appends `page=N` to URL params |

---

## Routes

### Home Page — `apps/customer/app/page.tsx`

**Rendering:** RSC. No `"use client"`.

**Sections (top to bottom):**
1. **Nav** — sticky, espresso bg. Logo · Browse · Boutiques · Sale · search/wishlist/cart/profile icons
2. **Hero** — full-width espresso bg, Bodoni Moda heading (seasonal string from config constant), one CTA `SHOP NOW → /browse`. Cloudinary image slot.
3. **Category tiles** — 4 tiles: Occasion / Everyday / Travel / Sport → `/browse?category=[slug]`. Product count badge from server-side `COUNT GROUP BY category`.
4. **Featured products** — "New Arrivals" horizontal scroll, 6 products (`orderBy: createdAt desc, take: 6`). Uses `ProductCard`.
5. **Featured boutiques** — 3 boutique cards (name, city, product count). Links to `/vendors/[id]`.
6. **AI Stylist banner** — full-width espresso strip. Signed-in, no size profile: "Luna knows your size. Ask her anything." + `CHAT WITH LUNA →`. After size profile set: replaced with "Your style, saved" message.

**Server data (parallel `Promise.all`):** category counts, 6 newest products, 3 active boutiques, current user size profile status.

---

### Browse — `apps/customer/app/browse/page.tsx` + `apps/customer/app/browse/[category]/page.tsx`

**Rendering:** RSC shell + client `FilterBar`.

**Filter bar (client `FilterBar.tsx`):**
- Scrollable pill row with active filter chips (✕ to remove)
- `+ Filters` opens `FilterDrawer.tsx` (bottom sheet): category checkboxes, size grid, fabric multi-select, price range slider, boutique multi-select
- Sort: Newest / Price low–high / Price high–low / Most reviewed
- Changes use `router.replace()`

**Product grid (RSC `ProductGrid.tsx`):**
- 4 columns desktop → 2 columns mobile (`grid-cols-2 md:grid-cols-4`)
- Prisma query built from URL params
- Suspense boundary → skeleton cards
- Infinite scroll via `LoadMoreButton` client component appending `page=N`

**Search:** `?q=keyword` added to URL by search input in filter bar. Prisma: `OR [title contains, fabric contains, vendor name contains]`.

**Size-aware highlighting:** if size profile exists, out-of-stock variants in customer's size show "Low stock in your size" badge.

**Empty state:** "Luna hasn't found a match — try asking her" → `/chat`.

---

### Product Detail — `apps/customer/app/p/[slug]/page.tsx`

**Rendering:** RSC shell, client islands for gallery, size picker, wishlist.

**Left column — `ProductGallery.tsx` (client):**
- Main image + up to 6 thumbnails from `product.aiImages` JSON
- Click thumbnail → swap main image
- Pinch-to-zoom on mobile

**Right column:**
- Vendor badge → `/vendors/[id]`
- Title (Bodoni Moda), price in AED
- Fabric tag, care instructions from `product.sizeGuide` JSON
- **`SizeSelector.tsx` (client):** size grid — zero-stock greyed/strikethrough, recommended size gold ring + "Your size" label, hover shows stock count if ≤ 5
- Color swatches (if multiple colors)
- `ADD TO BAG` — disabled until size selected. Server Action appends to cart cookie `[{ variantId, qty, addedAt }]`
- Wishlist heart toggle
- **Luna Fit strip:** if size profile → "Luna thinks this fits you well in M". If no profile → "Add your measurements → [Set up size profile]" (links to `/profile/size`)

**Below the fold:**
- Size guide accordion (from `product.sizeGuide` JSON)
- Reviews: star average + up to 5 reviews with pagination (RSC)
- "More from [Vendor]" — 4 products, same vendor (RSC)

**`generateMetadata()`:** SEO title/description/OG from product data.

**Cart cookie schema:** `[{ variantId: string, qty: number, addedAt: string }]` — max 20 items, `HttpOnly: false` (nav badge needs client read). Migrated to DB `Order` model in Phase 3.

---

### Vendor Boutique — `apps/customer/app/vendors/[id]/page.tsx`

**Rendering:** RSC.

**Boutique header:**
- Full-width espresso banner: vendor logo, store name (Bodoni Moda), city badge, "Active since" year
- Stats: total products, average rating, total reviews (`_count` aggregation)
- "Follow" button — disabled in Phase 2, tooltip "Coming soon"

**Product grid:**
- Same `ProductGrid.tsx` RSC component, pre-filtered to `vendorId`
- `FilterBar` works within boutique scope
- No category filter (redundant for single vendor)

**About section:**
- Vendor description placeholder (vendors fill in Phase 4)
- Standard platform return policy badge (hardcoded)

**Error handling:** `vendor.status !== 'ACTIVE'` → `notFound()`.

**`generateMetadata()`:** boutique name + city, logo as OG image.

---

### Luna AI Stylist — `apps/customer/app/chat/page.tsx` + `LunaChatWidget.tsx`

**Server Action — `apps/customer/app/actions/chat.ts`:**

```ts
export async function chatAction(messages: CoreMessage[], sessionId: string) {
  const customer = await currentUser();
  const sizeProfile = await prisma.sizeProfile.findUnique({
    where: { customerProfile: { userId: customer.id } }
  });
  return runShoppingAgent(messages, { sizeProfile, sessionId });
}
```

**Shopping agent tools (stubs → real Prisma):**

| Tool | Implementation |
|---|---|
| `search_products` | Prisma `where { OR [title/fabric contains], status: ACTIVE }`, top 5 results with variant stock |
| `recommend_size` | Compare `sizeProfile` bust/hip/height against `product.sizeGuide` JSON lookup, return best-fit size + note |
| `add_to_cart` | Append to cart cookie via `cookies()` API |
| `style_look` | Rule-based: same fabric family, complementary colors — returns 2–3 product IDs |

**`AISession` persistence:**
- Every conversation writes to `AISession` table (`agentType: SHOPPING`)
- `messages` JSON updated each turn, `context` JSON stores sizeProfile snapshot
- Customers return to `/chat` and continue last conversation

**Product card embeds:**
- `search_products` tool result streams a `[PRODUCT:slug]` token
- Client detects pattern → renders inline `ProductCard` in chat bubble

**Full page `/chat`:**
- Desktop: conversation (60%) left, product suggestions sidebar (40%) right — sidebar updates as products are recommended
- Mobile: single column, product cards inline in conversation
- History loaded from `AISession` on mount
- "Clear conversation" → clears `AISession.messages`, keeps `context`

**Floating widget `LunaChatWidget.tsx`:**
- Bottom-right, all pages — espresso bubble, gold crescent moon icon
- Click → 380×520px slide-up panel
- Same `useChat` hook and Server Action
- Hidden on `/chat` full page
- `z-index: 50`

---

## Implementation Tasks (for planning)

1. Design system token update — Warm Oud (`packages/config/tailwind`)
2. Seed script (`packages/db/prisma/seed.ts`)
3. Shopping agent tool wiring — real Prisma queries (`packages/ai/src/agents/shopping.ts`)
4. New UI components — `FilterBar`, `FilterDrawer`, `ProductGallery`, `SizeSelector`, `ChatMessage`, `LunaChatWidget` (`packages/ui`)
5. Home page (`apps/customer/app/page.tsx`)
6. Browse page + filter system (`apps/customer/app/browse/`)
7. Product detail page (`apps/customer/app/p/[slug]/`)
8. Vendor boutique page (`apps/customer/app/vendors/[id]/`)
9. AI Stylist — Server Action + full page + floating widget (`apps/customer/app/chat/` + `actions/chat.ts`)

---

## Out of Scope (Phase 2)

- `/cart`, `/checkout`, Luna Pay → Phase 3
- `/profile/size` size profile editor → Phase 3
- `/wishlist`, `/orders`, `/wallet` → Phase 3
- Vendor OS → Phase 4
- Real AI image generation → Phase 5
- Full-text search (Algolia / Postgres FTS) → Phase 8
- "Follow boutique" feature → Phase 3
