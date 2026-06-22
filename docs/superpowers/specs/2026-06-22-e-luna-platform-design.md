# e-Luna Platform — Design Specification

**Date:** 2026-06-22  
**Status:** Approved  
**Version:** 1.0  
**Project:** e-Luna Commerce OS  
**Location:** `/Users/alialajme/Projects/Luna/e-luna/`

---

## 1. Product Overview

e-Luna is an AI-powered marketplace and commerce operating system for the abaya and modest fashion industry in the Gulf region (UAE, GCC). It is not a single-brand store — it is a multi-vendor OS connecting customers, boutiques, designers, and manufacturers through a single platform powered by a mesh of cooperating AI agents.

### 1.1 Core Value Proposition

- **For customers:** Discover and purchase abayas guided by an AI stylist that knows your size, taste, and occasion — no manual searching
- **For vendors:** Go from 3 product photos to a full campaign in under a minute via Luna Studio AI, and manage your entire business from one dashboard
- **For the platform owner:** Full visibility into GMV, vendor health, fraud signals, and payouts across the entire commerce network

### 1.2 Competitive Context

Primary reference competitor: **ananline.ae** — a single-brand luxury abaya store built on Odoo with no AI features, no multi-vendor capability, and no logistics OS. e-Luna is architecturally different in every dimension.

---

## 2. Architecture

### 2.1 Repository Structure

Turborepo monorepo. Three independently deployable Next.js 15 apps sharing five packages.

```
e-luna/
├── apps/
│   ├── customer/          → luna.ae
│   ├── vendor/            → sell.luna.ae
│   └── admin/             → ops.luna.ae
└── packages/
    ├── ui/                → Luna design system (shadcn/ui + Tailwind tokens)
    ├── db/                → Prisma schema + PostgreSQL client
    ├── ai/                → All 6 Luna AI agents (Vercel AI SDK + Claude)
    ├── auth/              → Clerk auth logic + role definitions
    └── config/            → ESLint, TypeScript, Tailwind base config
```

### 2.2 Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15 (App Router) | Full-stack, RSC, server actions, no separate API needed |
| Monorepo | Turborepo | Build caching, parallel task execution, independent deploys |
| Language | TypeScript | Type safety across all apps and packages |
| Styling | Tailwind CSS + shadcn/ui | Speed, consistency, Luna custom tokens |
| Database | PostgreSQL via Prisma | Relational integrity, type-safe queries |
| Auth | Clerk | MFA built-in, multi-role, session management |
| AI | Vercel AI SDK + Claude claude-sonnet-4-6 | Streaming, tool use, multi-agent context |
| Media | Cloudinary | Image transforms, AI asset storage, CDN |
| Payments | Stripe + Tabby + Tamara | Cards, Apple Pay, Google Pay, Gulf-native BNPL |
| Deployment | Vercel | Native Next.js monorepo support, edge functions |

---

## 3. Authentication & Security

### 3.1 Provider

Clerk handles all authentication across all three apps. Role is stored on the User record and enforced by Clerk middleware at the route level in each app.

### 3.2 MFA — Mandatory for All User Types

MFA is not optional. All three user types must complete MFA enrollment before accessing their respective app.

| Role | MFA Method | Enforcement Point |
|------|-----------|-------------------|
| Customer | SMS OTP or Authenticator app | After sign-up, before first purchase |
| Vendor | Authenticator app | Required during onboarding — cannot proceed without |
| Admin | WebAuthn / Hardware key (TOTP) | Required at sign-in — no bypass |

### 3.3 Role Definitions

```typescript
type UserRole = 'CUSTOMER' | 'VENDOR' | 'ADMIN'
```

Each app is scoped to one or two roles. Middleware in each Next.js app rejects requests from the wrong role at the edge.

---

## 4. Core Data Model

All entities live in PostgreSQL, managed by Prisma in `packages/db`. Key entities:

### 4.1 Identity

**User**
```
id            String    (Clerk user ID)
email         String
role          UserRole  (CUSTOMER | VENDOR | ADMIN)
name          String
phone         String?
mfaEnabled    Boolean
mfaMethod     MfaMethod (SMS | TOTP | WEBAUTHN)
createdAt     DateTime
```

**Vendor** (extends User where role = VENDOR)
```
id              String
userId          String    → User
storeName       String
logo            String?
bio             String?
status          VendorStatus  (PENDING | ACTIVE | SUSPENDED)
commissionRate  Float
mfaVerifiedAt   DateTime
```

**CustomerProfile** (extends User where role = CUSTOMER)
```
id              String
userId          String    → User
loyaltyPoints   Int
walletBalance   Decimal
sizeProfileId   String?   → SizeProfile
```

### 4.2 Size Profile (powers AI smart search)

The SizeProfile entity is central to the Shopping Agent. It is filled in by the customer at `/profile/size` and read by the AI at every product search and recommendation.

```
id                    String
customerId            String    → CustomerProfile
height                Float?    (cm)
weight                Float?    (kg)
bust                  Float?    (cm)
waist                 Float?    (cm)
hip                   Float?    (cm)
shoulderWidth         Float?    (cm)
sleeveLength          Float?    (cm)
preferredAbayadLength AbayadLength  (FULL | MID | SHORT)
fitPreference         FitPreference (LOOSE | FITTED | OVERSIZED)
usualSize             String?   (S / M / L / 44 / 46 …)
sizeSystem            SizeSystem    (UAE | UK | EU | US)
updatedAt             DateTime
```

The Shopping Agent cross-references SizeProfile against each Product's `sizeGuide` (Json) to:
- Filter products to compatible sizes automatically
- Pre-select the correct variant on the product page
- Flag products that run small or large vs the customer's measurements

### 4.3 Catalogue

**Product**
```
id            String
vendorId      String    → Vendor
title         String
description   String
price         Decimal
category      String
fabric        String?
aiImages      Json      (Cloudinary URLs of generated assets)
sizeGuide     Json      (measurements per size label)
status        ProductStatus  (DRAFT | ACTIVE | ARCHIVED)
createdAt     DateTime
```

**ProductVariant**
```
id          String
productId   String    → Product
size        String
color       String
sku         String
stock       Int
price       Decimal?  (override, null = use Product.price)
```

### 4.4 Commerce

**Order**
```
id              String
customerId      String    → CustomerProfile
status          OrderStatus  (PENDING | CONFIRMED | PACKING | SHIPPED | DELIVERED | CANCELLED | RETURNED)
subtotal        Decimal
discount        Decimal
total           Decimal
paymentMethod   String
addressId       String    → Address
createdAt       DateTime
```

**OrderItem**
```
id                  String
orderId             String    → Order
variantId           String    → ProductVariant
vendorId            String    → Vendor
quantity            Int
unitPrice           Decimal
fulfillmentStatus   String
```

**Shipment**
```
id                  String
orderId             String    → Order
courier             String    (Aramex | Fetchr | DHL | SMSA | …)
trackingNumber      String
status              ShipmentStatus  (CREATED | IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | RETURNED)
estimatedDelivery   DateTime
cost                Decimal
```

### 4.5 AI

**AISession**
```
id          String
userId      String    → User
agentType   AgentType  (SHOPPING | SELLER | STUDIO | LOGISTICS | PAYMENT | POS)
messages    Json      (chat history)
context     Json      (size profile snapshot, active cart, preferences)
createdAt   DateTime
updatedAt   DateTime
```

### 4.6 Supporting Entities (not detailed above)

Address, Review, Wishlist, Notification, Payout, StudioUpload, PaymentTransaction, LoyaltyTransaction

---

## 5. App Structure & Routes

### 5.1 Customer App — `apps/customer` → luna.ae

#### Discovery
| Route | Description |
|-------|-------------|
| `/` | Home — featured collections, seasonal banners |
| `/browse` | Product grid with filters (category, fabric, price, size) |
| `/browse/[category]` | Category-scoped browse |
| `/p/[slug]` | Product detail — images, variants, size guide, AI styling tab |
| `/vendors/[id]` | Boutique storefront page |

#### AI Stylist
| Route | Description |
|-------|-------------|
| `/chat` | Full-page Luna AI Stylist conversation |
| *(widget)* | Persistent chat bubble on all pages — same agent, same session context |

#### Commerce
| Route | Description |
|-------|-------------|
| `/cart` | Bag review — items, quantities, totals, BNPL split preview |
| `/checkout` | Address + payment selection |
| `/checkout/confirm` | Order placed confirmation |

#### Account
| Route | Description |
|-------|-------------|
| `/profile` | Personal info, addresses, preferences |
| `/profile/size` | Size profile form — feeds AI smart search |
| `/orders` | Order history |
| `/orders/[id]` | Live order tracking with courier timeline |
| `/wishlist` | Saved products |
| `/wallet` | Luna Wallet balance, cashback, loyalty points |

#### Auth
| Route | Description |
|-------|-------------|
| `/sign-in` | Clerk sign-in with MFA step |
| `/sign-up` | Registration with MFA enrollment |

---

### 5.2 Vendor App — `apps/vendor` → sell.luna.ae

#### Overview
| Route | Description |
|-------|-------------|
| `/` | Dashboard — GMV, orders, AI Seller Agent action cards |

#### Products
| Route | Description |
|-------|-------------|
| `/products` | Product list with status filters |
| `/products/new` | Create product — details, variants, size guide |
| `/products/[id]` | Edit product — metadata, variants, stock |
| `/inventory` | Stock levels per variant across all products |

#### Luna Studio AI
| Route | Description |
|-------|-------------|
| `/studio` | Upload 3 garment photos → trigger AI campaign generation |
| `/studio/[id]` | Review generated assets (images, copy, video) → publish to listing |

#### Orders & Logistics
| Route | Description |
|-------|-------------|
| `/orders` | Incoming orders queue |
| `/orders/[id]` | Order detail — fulfillment actions, shipment creation |
| `/returns` | Return requests and resolutions |

#### Business
| Route | Description |
|-------|-------------|
| `/analytics` | Revenue, conversion rate, top products, trends |
| `/payouts` | Earnings history, upcoming payout, bank details |
| `/settings` | Store profile, logo, shipping zones, IBAN |

#### Auth
| Route | Description |
|-------|-------------|
| `/sign-in` | Clerk sign-in with MFA enforcement |
| `/onboarding` | New vendor KYC flow + mandatory MFA setup |

---

### 5.3 Admin App — `apps/admin` → ops.luna.ae

#### Platform Overview
| Route | Description |
|-------|-------------|
| `/` | Platform GMV, revenue, active users, order volume, take rate |

#### Sellers
| Route | Description |
|-------|-------------|
| `/sellers` | All vendors with status and revenue summary |
| `/sellers/[id]` | Vendor detail — KYC documents, store metrics, actions |
| `/sellers/approvals` | Pending KYC approval queue |

#### Orders & Products
| Route | Description |
|-------|-------------|
| `/orders` | All platform orders with cross-vendor view |
| `/orders/[id]` | Order detail with admin intervention capability |
| `/products` | All listings — moderation and visibility control |

#### Trust & Safety
| Route | Description |
|-------|-------------|
| `/fraud` | Flagged orders, velocity patterns, suspicious accounts |
| `/customers` | Customer accounts — view, contact, suspend |

#### Finance
| Route | Description |
|-------|-------------|
| `/payouts` | Vendor payout queue — approve, hold, process |
| `/commissions` | Commission rate rules per vendor tier |

#### Platform Config
| Route | Description |
|-------|-------------|
| `/analytics` | Platform-wide KPIs, cohort trends, category performance |
| `/settings` | Feature flags, product categories, platform configuration |

---

## 6. AI Agent Mesh

All agents live in `packages/ai`. Built on Vercel AI SDK with Claude claude-sonnet-4-6 as the model. Each agent has:
- A focused system prompt scoped to its role
- A defined set of tools (typed functions the model can call)
- Access to the shared AISession context (size profile, order history, active cart, session preferences)

### 6.1 Agent Definitions

#### 🌙 Shopping Agent
- **Trigger:** Customer opens `/chat` or activates the persistent widget
- **Purpose:** Understand shopping intent, recommend products, style complete looks, answer product questions
- **Reads:** SizeProfile, Wishlist, Order history, Product catalogue
- **Tools:** `search_products()`, `get_product_detail()`, `recommend_size()`, `add_to_cart()`, `style_look()`, `get_occasion_picks()`

#### 📈 Seller Agent
- **Trigger:** Vendor loads dashboard (`/`)
- **Purpose:** Surface proactive actions to improve sales — reprice, restock, generate missing content, forecast demand
- **Reads:** Vendor's products, inventory levels, order history, platform pricing trends
- **Tools:** `suggest_price()`, `flag_low_stock()`, `trigger_studio()`, `forecast_demand()`, `get_competitor_range()`

#### ✨ Studio Agent
- **Trigger:** Vendor submits 3 photos at `/studio`
- **Purpose:** Turn garment photos into a full marketing campaign — studio shots, AI model imagery, product copy, SEO, video
- **Reads:** Uploaded Cloudinary images, product metadata, vendor brand kit
- **Tools:** `detect_garment()`, `generate_studio_images()`, `generate_model_images()`, `write_product_copy()`, `generate_video()`, `publish_to_product()`

#### 🚚 Logistics Agent
- **Trigger:** Order status moves to CONFIRMED
- **Purpose:** Select optimal courier per shipment, generate labels, track delivery, handle returns
- **Reads:** Order destination, package weight/dimensions, courier rate APIs, historical SLA data
- **Tools:** `select_courier()`, `create_shipment()`, `generate_label()`, `track_order()`, `initiate_return()`

#### 💳 Payment Agent
- **Trigger:** Customer reaches checkout
- **Purpose:** Orchestrate payment — apply wallet balance, loyalty points, seasonal credits, route to correct payment provider
- **Reads:** Cart total, CustomerProfile wallet balance, loyalty points, active promotions
- **Tools:** `apply_wallet_credit()`, `apply_loyalty_points()`, `split_payment()`, `process_stripe()`, `process_tabby()`, `process_tamara()`, `process_refund()`, `schedule_payout_vendor()`

#### 🏬 POS Agent
- **Trigger:** Background — webhooks from physical POS systems
- **Purpose:** Keep physical store inventory, loyalty, sales, and returns in sync with the online platform in real time
- **Reads:** POS webhook events, store inventory feeds, in-store sales
- **Tools:** `sync_inventory()`, `merge_loyalty_points()`, `process_return()`, `qr_lookup()`, `update_click_collect_status()`

### 6.2 Agent Handoff — Order Flow Example

```
Customer chat (Shopping Agent)
  → searches, styles look, adds to cart

Checkout triggered (Payment Agent)
  → applies wallet + loyalty, processes payment, confirms order

Order confirmed (Logistics Agent)
  → selects courier, creates shipment, generates label, notifies vendor

Delivery updates → pushed to customer via Notification
  → order tracking live at /orders/[id]
```

---

## 7. Design System — `packages/ui`

### 7.1 Theme: Moonlit Luxury

#### Colour Tokens
| Token | Hex | Role |
|-------|-----|------|
| `color-ink` | `#1a1a2e` | Primary background, dark surfaces |
| `color-ivory` | `#fdf9f4` | Light background, page bg |
| `color-gold` | `#c9a96e` | Accent, CTAs, highlights, Luna branding |
| `color-sand` | `#e8d9c4` | Borders, dividers, subtle backgrounds |
| `color-lilac` | `#c4a0f0` | AI features, Studio agent, Luna chat |
| `color-sage` | `#6dbf8e` | Success states, Admin app accent |
| `color-coral` | `#e57373` | Error states, fraud alerts, destructive actions |
| `color-mist` | `#888888` | Secondary text, placeholders |

#### Typography
| Font | Role | Weights |
|------|------|---------|
| Bodoni Moda | Display / editorial — hero headings, product names | 400, 700 |
| Hanken Grotesk | Interface & body — all UI, navigation, buttons, labels | 400, 500, 600, 700 |
| IBM Plex Sans Arabic | RTL / Arabic text throughout | 400, 600 |

#### Type Scale
| Token | Size | Font | Use |
|-------|------|------|-----|
| `text-display-xl` | 48px | Bodoni | Hero headings |
| `text-display-lg` | 36px | Bodoni | Page titles |
| `text-display-md` | 28px | Bodoni | Section headings |
| `text-body-xl` | 18px | Hanken | Lead paragraphs |
| `text-body-lg` | 16px | Hanken | Body text |
| `text-body-md` | 14px | Hanken | Default UI text |
| `text-body-sm` | 12px | Hanken | Labels, captions |
| `text-label` | 10px | Hanken | Uppercase tags, badges |

### 7.2 Shared Components

| Component | Description |
|-----------|-------------|
| `ProductCard` | Image, product name, price, vendor badge, wishlist toggle |
| `LunaChat` | Streaming AI chat bubble with inline product embed cards |
| `SizeGuide` | Profile-aware size selector — pre-selects from SizeProfile, flags fit warnings |
| `StatCard` | KPI tile for vendor and admin dashboards (value, delta, trend sparkline) |
| `StudioUploader` | 3-slot drag-and-drop photo uploader with progress and preview |
| `StatusBadge` | Pill badge for order, shipment, and vendor status values |
| `Notification` | Toast alerts + bell tray for all severity levels |
| `RTLProvider` | Wraps layout with `dir="rtl"` and IBM Plex Arabic font for Arabic locale |
| `AgentActionCard` | Seller Agent proactive suggestion card (reprice / restock / generate) |
| `OrderTimeline` | Visual step-by-step delivery progress for order tracking |

### 7.3 RTL Support

All three apps support Arabic (`ar`) locale. `RTLProvider` switches `dir`, font family, and text alignment. All layout components must be tested in both LTR and RTL.

---

## 8. Build Phases

### Phase 1 — Foundation & Core Commerce (MVP)
*Sub-projects 1, 2, 3*

**What ships:**
- Turborepo monorepo with all 3 apps and 5 packages scaffolded
- Complete Prisma schema (all entities, migrations)
- Clerk auth with MFA for all roles
- Luna design system with base components and Tailwind tokens
- Customer storefront: home, browse, filter, product detail, boutique pages
- Customer size profile (`/profile/size`) wired to product display
- Cart and checkout: Stripe cards, Apple Pay, Tabby, Tamara
- Order history and basic order status
- RTL/Arabic support throughout
- CI/CD on Vercel

**Definition of done:** A customer can discover abayas, see size-matched products, and complete a purchase. Vendors can be seeded by admin.

---

### Phase 2 — Vendor OS
*Sub-project 4*

**What ships:**
- Vendor onboarding: KYC flow, MFA setup, store profile, IBAN
- Product creation with variants, size guide, and manual image upload
- Inventory management per variant
- Incoming orders dashboard and fulfillment workflow
- Returns management
- Revenue and conversion analytics
- Payout history
- Minimal admin KYC approval queue (`/sellers/approvals` only) — required to unblock vendor onboarding before the full Admin Console ships in Phase 4

**Definition of done:** Vendors can self-onboard and manage their full product and order lifecycle without admin intervention. The platform owner can approve or reject vendor KYC submissions.

---

### Phase 3 — AI Layer
*Sub-projects 5, 8a*

**What ships:**
- Luna Studio AI: 3-photo upload → garment detection → AI studio images → AI model imagery → product copy → publish to listing
- Luna Shopping Agent: persistent chat widget, size-aware recommendations, outfit styling, AI add-to-cart
- Seller Agent: proactive action cards on vendor dashboard (reprice, restock, trigger Studio)
- AISession persistence — Luna remembers customer preferences across sessions

**Definition of done:** A customer can chat with Luna to find and buy a product without using search. A vendor can generate a full product campaign from 3 photos in under 2 minutes.

---

### Phase 4 — Operations & Full Platform
*Sub-projects 6, 7, 8b*

**What ships:**
- Admin Console: GMV dashboard, seller KYC approval queue, product moderation, fraud monitoring, payout management, commission rules, feature flags
- Logistics: Logistics Agent wired to order flow, Aramex/Fetchr/DHL courier integrations, automated label generation, live tracking, returns
- Full Agent Mesh: Payment Agent (Luna Wallet, cashback, loyalty), POS Agent (Retail Connect inventory sync, click & collect, QR commerce), end-to-end agent handoff chain

**Definition of done:** The platform owner has full visibility and control. Orders route automatically through courier selection. Physical stores sync in real time.

---

## 9. Open Questions & Deferred Decisions

| Topic | Question | Deferred to |
|-------|----------|-------------|
| Luna Wallet | Stripe wallet product or custom ledger? | Phase 4 design |
| AI image generation | Which model for Studio? (Stable Diffusion, Runway, DALL-E, Midjourney API) | Phase 3 design |
| AI video generation | Runway, Kling, or other? | Phase 3 design |
| Social commerce | Instagram/TikTok/Snapchat product tagging | Post-Phase 4 |
| iOS mobile app | PRD mentions iOS — architecture supports it via Next.js API routes, but not in current scope | Future |
| AR try-on | Virtual try-on mentioned in PRD future enhancements | Future |

---

## 10. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Availability | 99.9% uptime |
| Concurrent users | 100,000 |
| Search response time | < 2 seconds |
| Security | MFA all roles, PCI DSS (Stripe), GDPR, UAE data regulations |
| Accessibility | WCAG 2.1 AA |
| Localisation | Arabic (RTL) + English (LTR) from day one |
