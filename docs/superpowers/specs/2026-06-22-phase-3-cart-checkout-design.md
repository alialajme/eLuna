# Phase 3: Cart & Checkout Design

## Goal

Build the complete commerce layer for the e-Luna customer app: cart review, checkout flow, order confirmation, wishlist, address book, size profile, and order history. Payment processing is simulated via a gateway abstraction layer that is drop-in ready for Tabby, Tamara, and Stripe without changes to the checkout flow.

## Architecture

### Payment Gateway Abstraction

Location: `apps/customer/app/lib/payment/`

```
gateway.ts     — PaymentGateway interface + ChargeParams / ChargeResult / RefundParams / RefundResult types
simulated.ts   — SimulatedGateway: always succeeds, returns externalRef = `sim_<timestamp>`
tabby.ts       — TabbyGateway: correct API shape, TODO body for real SDK
tamara.ts      — TamaraGateway: correct API shape, TODO body for real SDK
factory.ts     — getGateway(method: PaymentMethod): PaymentGateway
```

**Interface:**
```typescript
interface PaymentGateway {
  charge(params: ChargeParams): Promise<ChargeResult>
  refund(params: RefundParams): Promise<RefundResult>
}

type ChargeParams = {
  amount: number        // in AED
  currency: string      // "AED"
  orderId: string
  customerEmail: string
  description: string
  metadata?: Record<string, string>
}

type ChargeResult = {
  success: boolean
  externalRef: string   // sim_xxx | tabby_xxx | tamara_xxx | stripe_xxx
  error?: string
}
```

**Factory:**
```typescript
// CARD and COD use SimulatedGateway in Phase 3
// TABBY → TabbyGateway (stub), TAMARA → TamaraGateway (stub)
// LUNA_WALLET → SimulatedGateway (wallet debit handled separately in Phase 6)
```

### Cart Cookie Shape

Already established: `luna_cart` cookie holds `CartItem[]`:
```typescript
type CartItem = { variantId: string; qty: number; addedAt: string }
```

The cart page enriches this with live product data from Prisma.

### Server Actions (all in `apps/customer/app/actions/`)

- `cart.ts` — existing: `addToCart`, `getCart`. Add: `removeFromCart(variantId)`, `updateCartQty(variantId, qty)`
- `checkout.ts` — new: `placeOrder(formData)` — the core transaction
- `wishlist.ts` — new: `toggleWishlist(productId)` — add or remove
- `address.ts` — new: `saveAddress(formData)`, `deleteAddress(id)`, `setDefaultAddress(id)`
- `profile.ts` — new: `saveSizeProfile(formData)`

### placeOrder() Transaction

```
1. getCart() → CartItem[]
2. Validate: cart not empty, all variantIds exist in DB
3. Fetch ProductVariant rows to get unitPrice, vendorId
4. Stock check: variant.stock >= requested qty (soft check — no reservation)
5. getGateway(paymentMethod).charge({ amount: total, ... }) → ChargeResult
6. If !success → return { error: chargeResult.error }
7. prisma.$transaction([
     prisma.order.create({ ... includes items and payment transaction })
   ])
8. (await cookies()).delete("luna_cart")
9. return { orderId }
```

---

## Pages & Components

### `/cart` — Cart Review

**File:** `apps/customer/app/cart/page.tsx` (RSC)
**Client island:** `apps/customer/app/cart/CartReview.tsx`

- RSC: reads cookie via `getCart()`, enriches with `prisma.productVariant.findMany({ include: { product: { include: { vendor } } } })`
- Shows: product image, title, vendor, size/colour, unit price, qty stepper (–/+), remove button, subtotal per line
- Summary sidebar: subtotal, shipping (flat AED 15 or free over AED 500), total
- BNPL callout: "Split into 4 payments with Tabby" (static display, links to /checkout)
- Empty state: "Your bag is empty" + Browse CTA
- "Proceed to Checkout" → `/checkout` (requires auth — middleware already enforces)

### `/checkout` — Address + Payment

**File:** `apps/customer/app/checkout/page.tsx` (RSC)
**Client islands:** `CheckoutForm.tsx`

Two sections rendered as a single page (not a multi-step wizard — cleaner on mobile):

**Section 1 — Delivery Address**
- If user has saved addresses: radio list of addresses with "Add new" option
- "Add new" expands an inline form: fullName, phone, addressLine1, addressLine2, city, emirate (dropdown: Dubai / Abu Dhabi / Sharjah / etc.), country (locked to AE)
- Saves via `saveAddress()` on "Place Order" (not a separate step)

**Section 2 — Payment Method**
- Radio cards with icons:
  - 💳 Credit / Debit Card — "Processed securely" (SimulatedGateway in Phase 3)
  - 🟢 Tabby — "Pay in 4, no interest" (stub gateway)
  - 🟣 Tamara — "Split in 3" (stub gateway)
  - 🌙 Luna Wallet — "Use your Luna balance" (SimulatedGateway)
  - 📦 Cash on Delivery — "+AED 5 fee"

**Order Summary sidebar** (sticky on desktop, accordion on mobile):
- Line items, subtotal, shipping, total
- "Place Order" button → calls `placeOrder()` server action

**Loading/error states:** Optimistic UI with `useFormStatus` / `useActionState`

### `/checkout/confirm` — Confirmation

**File:** `apps/customer/app/checkout/confirm/page.tsx` (RSC)

- Reads `orderId` from searchParams
- Fetches order from DB (must belong to current user)
- Shows: order number, items, total, payment method, "estimated delivery 2-5 business days"
- CTAs: "Track Order" → `/orders/[id]`, "Continue Shopping" → `/browse`
- Luna quote: "✦ Luna has notified your boutique. Your order is on its way."

### `/wishlist` — Saved Items

**File:** `apps/customer/app/wishlist/page.tsx` (RSC)

- Fetches `Wishlist` records with product includes
- Grid of `ProductCard` components (same as browse grid)
- Each card shows a filled heart icon
- Empty state: "Nothing saved yet — browse and tap ♡ to save"
- `WishlistToggle` client component — heart button on every ProductCard across the site
  - Calls `toggleWishlist(productId)` server action
  - Optimistic update via `useOptimistic`

**Integration:** `WishlistToggle` is added to `ProductCard` in `packages/ui` as an optional `isWishlisted` + `onToggle` prop. The RSC pages that render ProductCards pass down wishlist state.

### `/profile` — Account

**File:** `apps/customer/app/profile/page.tsx` (RSC)

- Clerk user info (read-only): avatar initial, name, email
- Link to `/profile/size`
- Address Book section:
  - List of saved addresses with edit / delete / "Set as default" actions
  - "Add new address" → inline form (same form component as checkout)
  - Default address has a gold "Default" badge

### `/profile/size` — Size Profile

**File:** `apps/customer/app/profile/size/page.tsx` (RSC)
**Client island:** `SizeProfileForm.tsx`

Fields (all optional except `usualSize`):
- `usualSize`: select (XS / S / M / L / XL / XXL)
- `sizeSystem`: select (EU / UK / US / Gulf)
- `height`: number input (cm)
- `weight`: number input (kg)
- `bust`, `waist`, `hip`, `shoulder`: number inputs (cm)
- `sleeveLength`: select (Short / 3/4 / Full)
- `preferredAbayadLength`: select (Short 130cm / Standard 145cm / Maxi 155cm)
- `fitPreference`: select (Fitted / Regular / Loose / Oversized)

On save → `saveSizeProfile(formData)` upserts `SizeProfile` linked to `CustomerProfile`.
Shows confirmation: "✦ Luna will use your measurements to find your perfect fit."

### `/orders` — Order History

**File:** `apps/customer/app/orders/page.tsx` (RSC)

- Fetches all orders for current user, newest first
- Each row: order number, date, item count, total, status badge (colour-coded)
- Click → `/orders/[id]`
- Empty state: "No orders yet — start shopping"

### `/orders/[id]` — Order Detail

**File:** `apps/customer/app/orders/[id]/page.tsx` (RSC)

- Fetches order with items, variants, products, shipments
- Header: order number, date, status badge
- Line items table: image, product name, size/colour, qty, unit price, line total
- Order total breakdown: subtotal, shipping, discount, total
- Shipment timeline (if shipment exists): vertical stepper with ShipmentStatus stages
- Payment info: method, transaction ref, status
- "Need help?" → links to /chat (Luna can look up order context)

---

## Auth Handling

All routes in this phase are auth-gated by the existing middleware (`/cart(.*)`, `/checkout(.*)`, `/orders(.*)`, `/profile(.*)`, `/wishlist(.*)`).

In dev without Clerk keys, `safeCurrentUser()` returns `null`. Each page checks for null user and renders a "Sign in to continue" prompt with a link to `/sign-in` rather than crashing.

---

## UI Tokens Used

All from the existing Warm Oud design system:
- `bg-ink` / `text-ivory` — payment method selected state, CTA buttons
- `text-gold` — price highlights, Luna quotes, default badge
- `border-sand` — card borders, dividers
- `text-mist` — secondary text
- `bg-coral` — error states, out-of-stock warnings
- `bg-sage` — success states (order confirmed)
- Font: `font-display` for order numbers/totals, `font-sans` for body

---

## Scope Exclusions (deferred)

- Real Stripe / Tabby / Tamara API calls — gateway stubs are the integration point
- Luna Wallet balance tracking — deferred to Phase 6 (AI Agent Mesh)
- Return/refund flow — deferred to Phase 7 (Logistics)
- Push notifications for order status — deferred to Phase 6
- Promo codes / discount logic — deferred
