# e-Luna — Project Memory

This file is the living memory for the e-Luna project. Update it after every significant decision, change, or conversation. It is read by Claude at the start of every session.

---

## What is e-Luna?

e-Luna is an AI-powered marketplace and commerce operating system for the abaya and modest fashion industry in the Gulf region (UAE, GCC). It connects customers, boutiques, designers, and manufacturers through a unified platform with AI agents at its core.

**Tagline:** The Gulf's AI-powered abaya marketplace  
**Target market:** UAE + GCC, Arabic-speaking modest fashion buyers and sellers  
**Competitor reference:** ananline.ae — a single-brand abaya store (not a marketplace), built on Odoo, no AI features. e-Luna is architecturally different: multi-vendor OS vs single brand.

---

## Project Location

```
/Users/alialajme/Projects/Luna/e-luna/
```

Source documents (PRD, presentations) are in:
```
/Users/alialajme/Projects/Luna/
  ├── e-Luna Product Requirements Document.docx   ← Full PRD
  ├── LUNA_Marketplace_Walkthrough.pptx           ← Customer journey walkthrough
  └── e-Luna-Platform-2.pptx                      ← Platform OS overview
```

Existing related project (separate, do not merge):
```
/Users/alialajme/Projects/luna-platform/   ← Earlier Next.js scaffold, separate project
```

---

## Architecture Decision

**Turborepo monorepo** — 3 Next.js 15 apps + 5 shared packages.

```
e-luna/
├── apps/
│   ├── customer/     → luna.ae          (storefront, AI stylist, cart, orders)
│   ├── vendor/       → sell.luna.ae     (seller OS, Luna Studio AI, analytics)
│   └── admin/        → ops.luna.ae      (platform GMV, approvals, fraud, payouts)
└── packages/
    ├── ui/           → Luna design system (shadcn/ui + custom Tailwind tokens)
    ├── db/           → Prisma schema + PostgreSQL client
    ├── ai/           → All 6 Luna AI agents (Vercel AI SDK + Claude)
    ├── auth/         → Shared Clerk auth logic + role definitions
    └── config/       → ESLint, TypeScript, Tailwind base config
```

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 15 (App Router) | Full-stack, RSC, server actions |
| Monorepo | Turborepo | Build caching, independent app deploys |
| Language | TypeScript | Type safety across all packages |
| Styling | Tailwind CSS + shadcn/ui | Speed + Luna custom tokens |
| Database | PostgreSQL via Prisma | Relational, strong typing |
| Auth | Clerk | MFA built-in, multi-role support |
| AI | Vercel AI SDK + Claude claude-sonnet-4-6 | Streaming, tool calls, agent mesh |
| Media | Cloudinary | Image transformations, AI asset storage |
| Payments | Stripe + Tabby + Tamara | Cards, BNPL (Gulf-native) |
| Deployment | Vercel (current) → Azure AKS (target) | Vercel now; Azure AKS UAE North infra-as-code added (`docker/`, `infra/bicep`, `infra/helm`, `.github/workflows/azure-deploy.yml`, `docs/deployment/azure-aks.md`). Cut over to Azure when the project is finished. See runbook. |

---

## Core Data Model (Key Entities)

- **User** — id (Clerk), email, role (CUSTOMER | VENDOR | ADMIN), mfaEnabled, mfaMethod
- **Vendor** — userId, storeName, status (PENDING | ACTIVE | SUSPENDED), commissionRate, mfaVerifiedAt
- **CustomerProfile** — userId, loyaltyPoints, walletBalance, sizeProfileId
- **SizeProfile** — body measurements (height, weight, bust, waist, hip, shoulder), garment prefs (sleeveLength, preferredAbayadLength, fitPreference, usualSize, sizeSystem). Used by Luna Shopping Agent for smart product matching.
- **Product** — vendorId, title, price, category, fabric, aiImages (Json), sizeGuide (Json), status
- **ProductVariant** — productId, size, color, sku, stock
- **Order** — customerId, status, subtotal, discount, total, paymentMethod, addressId
- **OrderItem** — orderId, variantId, vendorId, quantity, unitPrice, fulfillmentStatus
- **Shipment** — orderId, courier, trackingNumber, status, estimatedDelivery, cost
- **AISession** — userId, agentType, messages (Json), context (Json)
- **Also:** Address, Review, Wishlist, Notification, Payout, StudioUpload, PaymentTransaction

---

## Authentication & Security

- **MFA is mandatory for all user types** (decided 2026-06-22)
  - Customers: SMS OTP or Authenticator app
  - Vendors: Authenticator app (enforced at onboarding)
  - Admins: WebAuthn / Hardware key
- Auth provider: Clerk (handles MFA flows, session management)
- All routes protected by Clerk middleware per app

---

## App Routes

### Customer App — luna.ae
- `/` Home & featured collections
- `/browse` + `/browse/[category]` — Filter & sort products
- `/p/[slug]` — Product detail
- `/vendors/[id]` — Boutique storefront
- `/chat` — Luna AI Stylist full page (+ persistent widget on all pages)
- `/cart` — Bag review
- `/checkout` + `/checkout/confirm` — Checkout flow
- `/profile` — Customer info & preferences
- `/profile/size` — Size profile (feeds AI smart search)
- `/orders` + `/orders/[id]` — History & live tracking
- `/wishlist` — Saved items
- `/wallet` — Luna Wallet & cashback

### Vendor App — sell.luna.ae
- `/` — Dashboard (GMV, orders, AI alerts)
- `/products` + `/products/new` + `/products/[id]` — Product management
- `/inventory` — Stock levels per variant
- `/studio` + `/studio/[id]` — Luna Studio AI (upload 3 photos → full campaign)
- `/orders` + `/orders/[id]` — Incoming orders & fulfillment
- `/returns` — Return requests
- `/analytics` — Revenue, conversion, top products
- `/payouts` — Earnings & payout history
- `/settings` — Store profile, shipping zones, IBAN
- `/onboarding` — New vendor KYC + MFA setup

### Admin App — ops.luna.ae
- `/` — Platform GMV, revenue, active users, orders
- `/sellers` + `/sellers/[id]` + `/sellers/approvals` — Vendor management & KYC
- `/orders` + `/orders/[id]` — All platform orders
- `/products` — Product moderation
- `/fraud` — Flagged orders & patterns
- `/customers` — Customer accounts
- `/payouts` — Vendor payouts & IBAN management
- `/commissions` — Commission rates & rules
- `/analytics` — Platform-wide KPIs & trends
- `/settings` — Feature flags, categories, platform config

---

## AI Agent Mesh (6 Agents — packages/ai)

All agents: Vercel AI SDK + Claude claude-sonnet-4-6. Shared context: size profile, order history, wishlist, session prefs (stored in AISession table).

| Agent | Trigger | Key Tools |
|-------|---------|-----------|
| 🌙 Shopping | Customer chat | `search_products()`, `recommend_size()`, `add_to_cart()`, `style_look()` |
| 📈 Seller | Vendor dashboard | `suggest_price()`, `flag_low_stock()`, `trigger_studio()`, `forecast_demand()` |
| ✨ Studio | 3-photo upload | `detect_garment()`, `generate_images()`, `write_copy()`, `generate_video()` |
| 🚚 Logistics | Order placed | `select_courier()`, `create_shipment()`, `track_order()`, `initiate_return()` |
| 💳 Payment | Checkout | `apply_credits()`, `split_payment()`, `process_refund()`, `payout_vendor()` |
| 🏬 POS | Background sync | `sync_inventory()`, `merge_loyalty()`, `process_return()`, `qr_lookup()` |

**Agent handoff flow (order):** Shopping → Payment → Logistics → Delivery notification

---

## Design System (packages/ui)

**Theme:** "Warm Oud" (approved 2026-06-22)

### Colours
| Token | Hex | Use |
|-------|-----|-----|
| Ink | `#1a0a00` | Primary background, dark surfaces (espresso-brown) |
| Ivory | `#fff8ee` | Light background (warm cream) |
| Gold | `#d4a855` | Accent, CTAs, highlights (warm gold) |
| Sand | `#f0e8d8` | Borders, dividers (light sand) |
| Lilac | `#c4a0f0` | AI features, Studio agent |
| Sage | `#6dbf8e` | Success states, Admin app |
| Coral | `#e57373` | Error, fraud alerts |
| Mist | `#888888` | Subtle / secondary text |

### Typography
- **Bodoni Moda** — Display / editorial (hero headings, product names)
- **Hanken Grotesk** — Interface & body (UI, navigation, buttons)
- **IBM Plex Sans Arabic** — RTL / Arabic text

### Key Components
- `ProductCard` — image, name, price, vendor badge, wishlist toggle
- `LunaChat` — streaming AI chat bubble with product embeds
- `SizeGuide` — profile-aware size selector with fit warnings
- `StatCard` — KPI tiles for vendor + admin dashboards
- `StudioUploader` — 3-photo drop zone with progress + preview
- `StatusBadge` — order/shipment/seller status pills
- `Notification` — toast + bell tray
- `RTLProvider` — wraps layout with `dir` + Arabic font switch

---

## Sub-project Build Order

Each sub-project gets its own spec → plan → implementation cycle.

| # | Sub-project | Status |
|---|------------|--------|
| 1 | Foundation (monorepo setup, auth, DB schema, design system) | ✅ Complete — 15 commits, 55 files, all packages + apps wired |
| 1.5 | Layout scaffold (Nav, Footer, RTLProvider) | ✅ Complete — commit cc3d367 |
| 2a | Browse pages (/browse, /browse/[category]) | ✅ Complete — commit d6f8f23 |
| 2b | Customer Storefront Phase 2 (UI components, ProductGrid, Home, Browse, ProductDetail, VendorBoutique, AI Stylist, cart action, chat route) | ✅ Complete — 17 tasks, commits e1e298f–85999f0 |
| note | Wishlist (/wishlist) deferred to Phase 3 (Cart & Checkout) | — |
| note | Phase 2 Vendor OS includes a minimal `/sellers/approvals` admin route to unblock KYC before full Admin Console (Phase 4) | — |
| 3 | Cart & Checkout (cart UI, checkout flow, wishlist, Luna Pay) | ✅ Complete — payment gateway abstraction (SimulatedGateway + Tabby/Tamara stubs), cart page, checkout + confirmation, wishlist, profile, size profile, orders |
| 4 | Vendor OS (dashboard, product management, inventory, orders) | ✅ Complete — analytics, payouts, orders, fulfillment (commits up to c4ff4dd) |
| 4b | Vendor Analytics & Payouts | ✅ Complete — KPI cards, top products, payout history (commits 04b9f48–c4ff4dd) |
| 5 | Luna Studio AI (photo upload → campaign generation) | ✅ Complete — detectGarment + writeCopy, upload API, server actions, list/wizard/results pages (commits 60efcad–3e33fc1) |
| 6a | Admin Console — Core Dashboard + Seller Management | ✅ Complete — dashboard KPIs, /sellers list+filter, /sellers/approvals queue, /sellers/[id] detail, approve/reject/suspend/reactivate actions (commits 702546c–9bcabca). Three auth layers: middleware + (dashboard) layout role gate + per-action ADMIN check |
| 6b | Admin Console — Orders + Products Moderation | ✅ Complete — /orders list + /orders/[id] detail (read-only), /products list + inline Reject/Reinstate, products.ts actions (ADMIN check), generalized StatusFilter (commits 9933d91–020c712) |
| 6c-i | Admin Console — Payouts + Commissions | ✅ Complete — /payouts (vendors-owed balance + Create Payout + history with process actions), /commissions (per-vendor rate editing + commission revenue), payouts.ts + commissions.ts actions (ADMIN-gated, server-side balance recompute) (commits 894a2d3–48cab9a) |
| 6c-ii | Admin Console — Analytics | ✅ Complete — /analytics: PeriodToggle (7/30/90d), 4 KPI cards w/ period-over-period % change, GMV line chart, top vendors, GMV by category. Hand-rolled inline-SVG LineChart + BarChart server components (zero deps) (commits 28e8141–60a5727) |
| 6d | Admin Console — Customers + Fraud | ✅ Complete — /customers (list: spend/loyalty/wallet) + /customers/[id] (detail: stats, order history cross-linked to /orders, wishlist/review counts, size-profile status); /fraud (heuristic review queue: failed payment / high value ≥3×mean / rapid repeat 3+/24h, reason badges). Read-only, no schema change (commits ac91d47–515994d) |
| 6e | Admin Console — Settings (platform settings / feature flags) | ✅ Complete (2026-08-10, commits eca548d–92e3ac0) — **first admin schema addition.** `PlatformSetting { key @id, value }` (via `db push`). `packages/db/src/settings.ts`: fixed typed `SETTINGS` registry (`free_shipping_threshold`=500, `shipping_fee`=15, `maintenance_banner`="") + `getSetting<K>` (typed return, coerce by type, **default-fallback + `.catch`-guarded** so a settings failure never breaks callers), `getAllSettings`, `setSetting` (validates key+type). Admin `/settings` page + `SettingsForm` (per-field save) + `updateSetting` action (**ADMIN-gated** via `getAuthUser`) + Sidebar nav. Wired: customer checkout free-shipping (`checkout.ts` placeOrder+initiateCardPayment, `checkout/page.tsx`, AND `cart/page.tsx`→`CartReview` so the cart preview matches checkout) + a site-wide **maintenance banner** (root layout made async, reads `maintenance_banner`). Absent settings = today's defaults (no behavior change on deploy). Add a new setting by extending the registry — no schema change. **Category management deferred** (separate cross-app phase; `Product.category` is still a free-form String). |
| 7 | Logistics (courier routing, tracking, returns) | 🟡 In progress — 7a + 7b ✅ done (returns/refunds live) |
| 7a | Shipments & Tracking | ✅ Complete (2026-08-10, commits b6554b3–e47d896) — **per-vendor shipments**: `Shipment.vendorId` + `OrderItem.shipmentId` (additive, `db push`). Vendor actions `createShipment`/`markShipmentDelivered` (`apps/vendor/app/actions/shipment.ts`, vendor-scoped, transactional) set items SHIPPED/DELIVERED; `recomputeOrderStatus` aggregates item fulfillment → `Order.status` (all DELIVERED→DELIVERED), **closing the loop with 8b `refund_eligibility`**. Vendor `FulfillmentPanel` = create-shipment form (courier dropdown + tracking + ETA) + Mark Delivered. Customer `orders/[id]` shows all shipments (per vendor), each with courier deep-link + `TrackingTimeline` component + items grouped by shipment (+ "Preparing" group). Shared courier registry at `@e-luna/ui/couriers` (pure data, subpath export: Aramex/Fetchr/Quiqup/Emirates Post/DHL). Live courier API deferred (manual tracking #). **Nits (future):** createShipment eligible-items query is outside the tx (double-submit race, mitigated by button-disable); TrackingTimeline shows blank for unknown ShipmentStatus (only IN_TRANSIT/DELIVERED written today). |
| 7b | Returns & Refunds | ✅ Complete (2026-08-10, commits 2da2b3f–7660f6c) — **vendor-driven** returns lifecycle on the existing `Return` model (no schema change). **Payment gateway extracted to `packages/payments` (`@e-luna/payments`)** — moved all 11 files from `apps/customer/app/lib/payment/`; both apps depend on it; customer checkout/webhook imports repointed. Customer `requestReturn(orderItemId, reason)` (`apps/customer/app/actions/returns.ts`, eligibility: DELIVERED + ≤14d of shipment.deliveredAt + no active return) → `ReturnButton` on `orders/[id]`. Vendor `apps/vendor/app/actions/returns.ts`: `approveReturn`/`rejectReturn`/`markReturnReceived`/`refundReturn(restock)` — all vendor-scoped (`orderItem.vendorId`) + state-precursor guards. **refundReturn: gateway `getGateway(paymentMethod).refund()` runs BEFORE any DB write** (abort on failure); on success `$transaction`: Return→REFUNDED+isRestocked, OrderItem→RETURNED (drops from 6c-i payout sum = free reversal), optional `variant.stock` increment, PaymentTransaction→REFUNDED (all returned) / PARTIALLY_REFUNDED. Vendor `/returns` queue + `ReturnActions` + Sidebar nav link. Shared `recomputeOrderStatus` moved to `apps/vendor/app/lib/order-status.ts`, now RETURNED-aware (all RETURNED→order REFUNDED). Final per-task reviews: extraction + money-flow both ✅. |
| 8 | AI Agent Mesh (all 6 agents wired up end-to-end) | 🟡 In progress — decomposed into 8a–8e; 8a + 8b ✅ done |
| 8a | Seller Agent + vendor assistant | ✅ Complete — real vendor-scoped tools (flag_low_stock, suggest_price [category-median benchmark], forecast_demand [30-vs-prior-30 trend], studio_link deep-link) via `buildSellerTools(vendorId)`/`runSellerAgent`; `/api/assistant` route; `LunaChatWidget` reused with new optional title/greeting props, mounted in vendor dashboard. vendorId is session-resolved, never an LLM param; ownership-checked product tools (commits 203c621–91fa5d3) |
| 8b | Payment Agent (advisory, checkout) | ✅ Complete — **advisory/READ-ONLY, moves no money** (charges/refunds stay in deterministic checkout). `buildPaymentTools(customerId)`/`runPaymentAgent(messages,{customerId})`; customerId = CustomerProfile.id session-resolved, closure-scoped, never an LLM param. 5 read-only tools: wallet_and_loyalty, order_coverage_preview, bnpl_split_preview (pure 4-installment math), refund_eligibility (ownership-checked `{id,customerId}`; DELIVERED + ≤14d + not refunded), payment_methods (live vs comingSoon). New `/api/payment-help` route (401/403/500); `LunaChatWidget` gained `hiddenPaths?` prop (default `["/chat"]`); Shopping widget hidden on /checkout, "Payment Help" widget mounted there. Dropped stub tools + old `paymentTools` export. (commits 7269bea–dcdfc4a) |
| Category Management | Managed category list replacing free-form Product.category | ✅ Complete (2026-08-10, commits b5c1513–ef94837) — new `Category { name, slug @unique, sortOrder, isActive }` model (`db push`) as single source of truth; `Product.category` STAYS a slug String (no FK/migration). `packages/db/src/categories.ts`: `getCategories()` (active, sorted, **DEFAULT_CATEGORIES fallback + .catch** so storefront never breaks pre-seed), `getAllCategories()`, `DEFAULT_CATEGORIES` (Occasion/Everyday/Travel/Sport, lowercase slugs), `CategoryDTO`. Admin `/categories` CRUD (`CategoryManager` + `actions/categories.ts` create/update/delete ADMIN-gated via `getAuthUser`, slug normalized + `P2002`→"Slug already in use") + Sidebar "🏷️ Categories" nav. Vendor `ProductForm` gets `categories` prop (from `getCategories()` in new/[id] pages); `product.ts` validates `data.category.toLowerCase()` ∈ managed slugs. Customer home/browse/`browse/[category]`/Footer (made async) all read `getCategories()`; fixed the latent home-count case-mismatch (lowercase both sides). Killed all 3 inconsistent hardcoded lists (vendor UPPERCASE / home TitleCase / browse lowercase). Category images/subcategories + FK migration deferred. |
| Payments Gateway | Real gateway integration (Stripe Card/Apple Pay/Google Pay + Tap/Noqodi/NeoPay scaffolds) | ✅ Complete (2026-08-09, commits c7d37e8–264e3a3) — Unified `createPayment()` discriminated union (`captured`\|`requires_action`\|`failed`) replaces the old `charge()`. **StripeGateway** = real adapter (PaymentIntent + `automatic_payment_methods` → Apple/Google Pay auto-surface, webhook verify, refund, retrievePayment). **Order-first + webhook** card flow: `initiateCardPayment` creates a PENDING order + PENDING tx + Stripe intent → Payment Element (`StripePaymentForm`) → settled by `/api/webhooks/stripe` (prod) or `syncOrderPayment` reconciler (dev, ownership-checked) via idempotent `applyPaymentResult` (only flips PENDING). `placeOrder` handles synchronous methods only (CARD rejected). **Simulated fallback**: no `STRIPE_SECRET_KEY` → `getGateway("CARD")`→Simulated→captured→dev unbroken. Apple/Google Pay recorded as `CARD` + `walletType` in tx metadata (no enum value). **Tap/Noqodi/NeoPay** = config-gated scaffolds (return "not configured"; factory gates on `hasX()`). Enum += `TAP/NOQODI/NEOPAY` (via `db push` — repo has NO migration files). Deps: `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`. Operator activation (real keys, webhook registration, Apple Pay domain verify, live `db push`, regional adapter impls) = `docs/deployment/payments.md`. **Open nits (future):** reconciler lacks a row lock (idempotent-by-value, safe); TAP/NOQODI/NEOPAY simulated-fallback should be gated to non-prod once surfaced in UI; `ConfirmPaymentSync` has no retry/timeout. |
| 8c | Logistics Agent (customer delivery assistant) | ✅ Complete (2026-08-10, commits 0b55dc5–471ba21) — **advisory/READ-ONLY** customer delivery agent over the real 7a/7b data. `buildLogisticsTools(customerId)`/`runLogisticsAgent(messages,{customerId})`; customerId = CustomerProfile.id session-resolved, closure-scoped, never an LLM param. 3 read-only tools: `list_my_orders`, `track_order` (ownership `{id,customerId}`; per-shipment courier/tracking/status/ETA/deliveredAt + item titles + notYetShipped), `return_options` (ownership; per-item delivered/withinWindow-14d/existingReturn/canRequestReturn — advisory, points to Request-return button). New `/api/delivery-help` route (401/403/500). `LunaChatWidget` gained `hiddenPrefixes?` prop; Shopping widget hidden on /orders* (`hiddenPrefixes={["/orders"]}`); "Delivery Help" widget mounted via new `apps/customer/app/orders/layout.tsx`. Dropped old `logisticsTools` export. No `@e-luna/ai`→`@e-luna/ui` dep (tools return courier name+tracking#, live link stays on order page). |
| 8e | AISession persistence | ✅ Complete (2026-08-10, commits a17f90c–e071dc9) — conversation memory for the 4 live chat agents. `AISession` gained `@@unique([userId, agentType])` (rolling session key, `db push`). `packages/ai/src/session.ts`: `loadAgentMessages(userId,agentType)`, `persistOnFinish(userId,agentType,inputMessages)` (streamText `onFinish` upsert, capped last 50, `.catch`-logged — never breaks the stream), `isAgentType`, `StoredMessage {id,role,content}`. All 4 `run*Agent` forward optional `onFinish`; the 4 streaming routes attach `persistOnFinish(user.id,"<TYPE>",messages)` (Shopping guest-tolerant). `GET /api/ai-history?agentType=` in both apps (validate agentType, key on session userId). `LunaChatWidget` gained `agentType?` prop → fetches history on mount, seeds via `setMessages`; 4 mount points pass SHOPPING/PAYMENT/LOGISTICS/SELLER. Guests ephemeral; widget backward-compatible. **Orchestration/handoff deferred (YAGNI — per-surface widgets already place the right agent).** |
| 8d | POS agent | ⛔ DEFERRED (decision 2026-08-10, `docs/superpowers/specs/2026-08-10-phase-8d-pos-agent-deferral.md`) — e-Luna is online-only; POS's stub tools (sync_inventory/merge_loyalty/in-store returns/qr_lookup) have NO backing data (single-channel inventory, online-only loyalty, no in-store channel, no QR). Wiring it would be a fake agent violating the "ground every agent in real data" rule. Needs a real omnichannel/in-store subsystem first (register + in-store transactions + QR + multi-channel inventory) — a separate product line. When built, wire via `buildPOSTools`/`runPOSAgent` + reuse 8e persistence with agentType "POS". |

---

## Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-06-22 | New standalone project under /Projects/Luna/e-luna | Separate from luna-platform scaffold |
| 2026-06-22 | Turborepo monorepo (3 apps + 5 packages) | Clean separation, shared design system, independent deploys |
| 2026-06-22 | Full-stack Next.js 15 (no separate backend) | Simplicity, server actions, RSC |
| 2026-06-22 | Clerk for auth with MFA mandatory for all roles | Security requirement from user |
| 2026-06-22 | Size profile entity linked to CustomerProfile | Powers AI smart product search/recommendation |
| 2026-06-22 | Claude claude-sonnet-4-6 via Vercel AI SDK for all agents | Streaming, tool use, shared context |
| 2026-06-22 | Cloudinary for media (AI-generated + vendor uploads) | Transformations, storage, CDN |
| 2026-06-22 | Tabby + Tamara for BNPL | Gulf-native BNPL providers |
| 2026-06-22 | Nav, Footer, and Layout for customer app | Sticky nav with auth state + cart count; dark footer with shop categories; RTLProvider wrapper |
| 2026-06-22 | Browse pages (/browse, /browse/[category]) | Dynamic filtering, pagination, size profile integration. 4 valid categories: occasion/everyday/travel/sport |
| 2026-06-22 | Product Detail page (/p/[slug]) | Client island (ProductDetail.tsx) + RSC page; Zod-validated sizeGuide; Luna Fit strip; cart Server Action |
| 2026-06-22 | Vendor Boutique page (/vendors/[id]) | Dark header with avg rating, fabric filter, filteredCount vs totalCount split, PAGE_SIZE exported from ProductGrid |
| 2026-06-22 | AI chat route (/api/chat) | POST handler wires Clerk auth + sizeProfile into runShoppingAgent, returns toDataStreamResponse() |
| 2026-06-22 | AI Stylist full page (/chat) + LunaChatWidget wired into layout | LunaChatWidget hides itself on /chat to avoid double widget; apiPath injected as prop |
| 2026-06-22 | Cart cookie (luna_cart) — HttpOnly: false | Nav badge reads it client-side; secure flag set in production; immutable updates; qty bounded 1-99 |
| 2026-06-30 | Luna Studio AI: fire-and-forget pipeline | `triggerStudioPipeline` is called without await from client; results page polls via `<meta http-equiv="refresh" content="3">`. **Vercel deployment note:** server actions have a 10s default timeout on hobby plans — configure `maxDuration` in `vercel.json` for the vendor app to at least 60s to handle two sequential Claude calls. |
| 2026-06-30 | Luna Studio AI: base64 data URLs for images | Cloudinary not configured; `StudioUpload.sourceImages` stores base64 data URLs. Future Phase 5b will migrate to Cloudinary CDN URLs. |
| 2026-06-30 | Luna Studio AI: image/video generation stubbed | `generate_images` and `generate_video` studioTools return empty values. Full implementation deferred to Phase 5b. |
| 2026-08-06 | Admin Console 6a: defense-in-depth authz | Server actions and RSC layout independently re-check ADMIN role via `getAuthUser()` from `@e-luna/auth`, not middleware alone — server actions are directly-invocable POST endpoints. Role gate lives in `(dashboard)/layout.tsx` (covers all child routes) + each action in `actions/sellers.ts`. |
| 2026-08-06 | Admin Console 6a: GMV definitions | Platform GMV (dashboard) = sum of `Order.total` where status NOT IN (CANCELLED, REFUNDED). Per-vendor GMV (detail page) = sum of `OrderItem.unitPrice × quantity` — item-level attribution since one order can span multiple vendors. |
| 2026-08-06 | ESLint configs added to all apps (CI fix) | Apps had no `.eslintrc.json` since scaffold, so CI's `pnpm lint` (`next lint`) hit an interactive prompt and failed. Each app now has `.eslintrc.json` extending `next/core-web-vitals`. Convention: internal navigation uses `next/link` `<Link>` (never raw `<a href>`); escape JSX entities. `<img>` for external/data-URL images is an accepted **warning** (does not fail `next lint`) — keep the `eslint-disable-next-line @next/next/no-img-element` comments where used. CI also runs `pnpm --filter "@e-luna/*" exec tsc --noEmit` after lint. |
| 2026-08-06 | Admin StatusFilter is generic | `StatusFilter` (admin `(dashboard)/components`) takes `{ status, options: {label,value}[] }` — each list page (sellers/orders/products) passes its own filter options with `{label:"All", value:"all"}` first. Pages default `raw` to "all". Reuse it for any future admin status-filtered list. |
| 2026-08-07 | Azure AKS (UAE North) deployment infra-as-code | Additive to Vercel (cut over when project finishes). Each app builds a Next.js `output:"standalone"` container via `docker/Dockerfile` (turbo-prune multi-stage) → ACR `elunaacr`; deployed to AKS `eluna-aks` by Helm chart `infra/helm/luna` (Deployment/Service/Ingress+cert-manager TLS/HPA/PDB, ≥2 replicas multi-zone, `/api/health` probes on port 3000). Bicep `infra/bicep` provisions AKS+ACR+PostgreSQL Flexible Server (zone-redundant HA)+Key Vault. Secrets via Key Vault CSI + workload-identity SA `luna-workload-identity`. CI/CD `.github/workflows/azure-deploy.yml` (OIDC, `az acr build`, `helm upgrade`). Resource names: RG `eluna-rg`, KV `eluna-kv`. Live provisioning/deploy is the operator's step — see `docs/deployment/azure-aks.md`. `az`/`docker`/`helm` NOT in dev env, so those artifacts are verified by authoring + presence, not local build. |
| 2026-08-07 | Charts are hand-rolled inline SVG (no chart lib) | Admin analytics uses pure-server-component `LineChart` (SVG polyline+area, `viewBox` + `preserveAspectRatio="none"`) and `BarChart` (flex + inline `style` height %) in `(dashboard)/components`. Zero dependencies, RSC-friendly, Warm Oud gold `#d4a855`. Both guard degenerate inputs (empty / max 0 / <2 points) to avoid NaN in SVG coords. Reuse these for future charts; do NOT add a charting library. Admin `PeriodToggle` (7/30/90d, `text-sage` active) mirrors the vendor one. Note: `noUncheckedIndexedAccess` is ON — array index writes need `arr[i] = (arr[i] ?? 0) + x`, never `+=`. |
| 2026-08-06 | CI typecheck fixed repo-wide | CI runs `pnpm --filter "@e-luna/*" exec tsc --noEmit` — this typechecks EVERY workspace package/app (8 total). It had never passed (CI died at lint first). Now: every package has a `tsconfig.json` extending `@e-luna/config/tsconfig/{base,nextjs}`; packages that import `next/*` must declare `next` as a devDep (ui, auth do now); ai declares `@types/node` + `@prisma/client`; apps declare `tailwindcss` (their `tailwind.config.ts` imports it and is in the tsconfig `include`); customer declares `zod` + `@prisma/client`. Internal packages export raw `.ts` (e.g. `@e-luna/db` → `./src/index.ts`), so consumers compile that source and need its transitive type deps (`@types/node` for `process`, `@prisma/client` for `Decimal`). `packages/db` tsconfig includes only `src/**` (the `prisma/seed.ts` script is run via tsx, not typechecked). Keep all 3 CI steps green: `pnpm install --frozen-lockfile`, `pnpm lint`, then the tsc filter. |

---

## Notes & Open Questions

- Luna Pay (wallet) — will this be a Stripe wallet product or a custom ledger? TBD
- Social commerce (Instagram/TikTok/Snapchat) — Phase 4, defer until core is live
- iOS mobile app — mentioned in PRD, not in current scope. Architecture (Option B API) would enable this later
- AI photography/video generation — which model? (Stable Diffusion, Midjourney API, Runway?) TBD for Studio Agent
- RTL: all three apps must support Arabic (`dir="rtl"`, IBM Plex Arabic)
