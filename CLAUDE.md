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
| Deployment | Vercel | Native Next.js monorepo support |

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

**Theme:** "Moonlit Luxury"

### Colours
| Token | Hex | Use |
|-------|-----|-----|
| Ink | `#1a1a2e` | Primary background, dark surfaces |
| Ivory | `#fdf9f4` | Light background |
| Gold | `#c9a96e` | Accent, CTAs, highlights |
| Sand | `#e8d9c4` | Borders, dividers |
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
| 1 | Foundation (monorepo setup, auth, DB schema, design system) | 📋 Plan written — `docs/superpowers/plans/2026-06-22-phase-1-foundation.md` |
| 2 | Customer Storefront (browse, search, product detail, AI stylist) | 🔲 Not started |
| note | Phase 2 Vendor OS includes a minimal `/sellers/approvals` admin route to unblock KYC before full Admin Console (Phase 4) | — |
| 3 | Cart & Checkout (cart, checkout flow, Luna Pay) | 🔲 Not started |
| 4 | Vendor OS (dashboard, product management, inventory, orders) | 🔲 Not started |
| 5 | Luna Studio AI (photo upload → campaign generation) | 🔲 Not started |
| 6 | Admin Console (GMV, seller approvals, fraud, payouts) | 🔲 Not started |
| 7 | Logistics (courier routing, tracking, returns) | 🔲 Not started |
| 8 | AI Agent Mesh (all 6 agents wired up end-to-end) | 🔲 Not started |

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

---

## Notes & Open Questions

- Luna Pay (wallet) — will this be a Stripe wallet product or a custom ledger? TBD
- Social commerce (Instagram/TikTok/Snapchat) — Phase 4, defer until core is live
- iOS mobile app — mentioned in PRD, not in current scope. Architecture (Option B API) would enable this later
- AI photography/video generation — which model? (Stable Diffusion, Midjourney API, Runway?) TBD for Studio Agent
- RTL: all three apps must support Arabic (`dir="rtl"`, IBM Plex Arabic)
