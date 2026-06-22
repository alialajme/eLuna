# Phase 4b: Vendor Product Management — Design Spec

## Goal

Replace the Phase 4a stub pages for `/products`, `/inventory`, and `/settings` with fully functional product CRUD, inline stock management, and a store settings page.

---

## Scope

| Route | Description |
|-------|-------------|
| `/products` | Product list — table with status filter, "New product" button |
| `/products/new` | Create product (two-column form) |
| `/products/[id]` | Edit product (same form, pre-populated) |
| `/inventory` | Stock management table — inline edit per variant |
| `/settings` | Store profile (name, description, logo URL) + IBAN |

**Out of scope:** Shipping zones (Phase 4c), Cloudinary file upload (Phase 5), order history per product (Phase 4c).

---

## File Structure

```
apps/vendor/app/
├── (dashboard)/
│   ├── products/
│   │   ├── page.tsx                    — overwrite stub (RSC, product list)
│   │   ├── new/
│   │   │   └── page.tsx                — RSC shell for create form
│   │   ├── [id]/
│   │   │   └── page.tsx                — RSC shell, fetches product for edit
│   │   └── components/
│   │       ├── ProductForm.tsx         — "use client", handles create + edit
│   │       └── VariantMatrix.tsx       — "use client", matrix builder
│   ├── inventory/
│   │   ├── page.tsx                    — overwrite stub (RSC)
│   │   └── components/
│   │       └── StockInput.tsx          — "use client", inline stock edit with useTransition
│   └── settings/
│       └── page.tsx                    — overwrite stub (RSC)
└── actions/
    └── product.ts                      — "use server" product actions
```

---

## Server Actions — `apps/vendor/app/actions/product.ts`

All functions are `"use server"` async exports.

### `createProduct(data)`

```ts
type CreateProductData = {
  title: string;
  description?: string;
  category: string;
  fabric?: string;
  careGuide?: string;
  images: string[];           // array of URLs, max 8
  price: number;
  compareAt?: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  variants: VariantInput[];
};

type VariantInput = {
  size: string;
  color: string;
  stock: number;
  price?: number;             // per-variant price override
};
```

- Validates: title 2–120 chars, price > 0, category one of `["OCCASION", "EVERYDAY", "TRAVEL", "SPORT"]`
- Auto-generates slug from title using the existing `slugify()` util (`apps/vendor/app/lib/slugify.ts`). Appends `-2`, `-3` etc. on collision.
- Auto-generates SKU per variant: `{storeSlug}-{slugify(title)}-{size}-{color}` truncated to 40 chars, uppercased
- Creates `Product` record, then creates all `ProductVariant` records
- Returns `{ success: boolean; productId?: string; error?: string }`

### `updateProduct(id, data)`

Same `data` shape as `createProduct`. Additionally:

- Verifies product belongs to current vendor (throws if not)
- Updates all top-level product fields
- For variants:
  - New size+color combinations → insert
  - Existing combinations → update stock + price override
  - Removed combinations that have `OrderItem` records → preserve (do not delete), just update stock
  - Removed combinations with no order history → delete
- Returns `{ success: boolean; error?: string }`

### `archiveProduct(id)`

- Sets `status = "ARCHIVED"` for the product
- Verifies product belongs to current vendor
- Returns `{ success: boolean }`

### `updateVariantStock(variantId, stock)`

- Validates `stock >= 0` (integer)
- Verifies variant's product belongs to current vendor
- Updates `ProductVariant.stock`
- Calls `revalidatePath("/inventory")`
- Returns `{ success: boolean; error?: string }`

---

## Product List Page — `(dashboard)/products/page.tsx`

RSC. Replaces the Phase 4a stub.

**Data:** `prisma.product.findMany({ where: { vendorId }, include: { variants: { select: { id: true } } }, orderBy: { createdAt: "desc" } })` with `.catch(() => [])`.

**Layout:**
- Header row: "Products" h2 left, "New product" gold button right → `/products/new`
- Status filter tabs: All | Draft | Active | Archived (query param `?status=`)
- Table columns: Title | Category | Price | Status badge | Variants count | Created date | Actions
- Status badge colours: DRAFT → `bg-sand text-mist`, ACTIVE → `bg-gold/20 text-gold`, ARCHIVED → `bg-coral/10 text-coral`
- Actions per row: "Edit" → `/products/{id}`, "Archive" (inline form calling `archiveProduct`)
- Empty state: centered text "No products yet. Add your first product." with "New product" link

---

## Product Form — `(dashboard)/products/components/ProductForm.tsx`

`"use client"`. Handles both create (`productId` is undefined) and edit (`productId` is set).

**Props:**
```ts
type Props = {
  productId?: string;
  initialData?: {
    title: string;
    description: string;
    category: string;
    fabric: string;
    careGuide: string;
    images: string[];
    price: number;
    compareAt?: number;
    status: "DRAFT" | "ACTIVE" | "ARCHIVED";
    variants: Array<{ size: string; color: string; stock: number; price?: number; hasOrders: boolean }>;
  };
};
```

**Two-column layout (Shopify-style):**

Left column — content fields:
- Title input (required, 2–120 chars)
- Description textarea (optional, max 1000 chars)
- Category select: Occasion / Everyday / Travel / Sport (values: OCCASION / EVERYDAY / TRAVEL / SPORT)
- Fabric text input (optional)
- Care Guide textarea (optional)
- Images section: list of URL text inputs (up to 8). Each shows a `<img>` thumbnail preview when the URL is non-empty. "+ Add image" button appends a new empty input. "✕" button removes a row (minimum 1 row).

Right sidebar — commerce fields:
- Price (AED) number input (required, min 1, step 0.01)
- Compare-at price (AED) number input (optional)
- Status select: Draft / Active / Archived
- `<VariantMatrix>` component (see below)
- "Save product" button (gold, full width) — disabled while submitting

**Save behaviour:**
- Calls `createProduct(data)` or `updateProduct(id, data)` depending on `productId`
- On success: `router.push("/products")`
- On error: shows inline error message below the save button

---

## Variant Matrix — `(dashboard)/products/components/VariantMatrix.tsx`

`"use client"`. Embedded in the `ProductForm` sidebar. Manages a controlled `variants` state array passed back to `ProductForm` via `onChange`.

**Props:**
```ts
type Props = {
  value: Array<{ size: string; color: string; stock: number; price?: number; hasOrders: boolean }>;
  onChange: (variants: Array<{ size: string; color: string; stock: number; price?: number; hasOrders: boolean }>) => void;
};
```

**UI flow:**
1. Two tag inputs: **Sizes** and **Colors**. User types a value and presses Enter (or comma) to add a tag. Tags can be removed with ✕. Pre-populated from `value` prop on edit.
2. "Generate combinations" button — produces the full Cartesian product of sizes × colors. Existing variants (from `value`) are merged in: their stock and price values are preserved. New combinations default to stock = 0.
3. Variant table — one row per combination:
   - Size (read-only label)
   - Color (read-only label)
   - Stock (number input, min 0)
   - Price override (number input, optional, placeholder "Same as product")
   - ✕ remove button — disabled and shows a lock icon if `hasOrders === true`

---

## New Product Page — `(dashboard)/products/new/page.tsx`

RSC. Metadata: `"New product — Luna Vendor"`.

Renders:
```tsx
<div className="max-w-4xl">
  <h2 className="font-display text-display-md text-ink mb-6">New product</h2>
  <ProductForm />
</div>
```

---

## Edit Product Page — `(dashboard)/products/[id]/page.tsx`

RSC. Fetches product with variants:

```ts
const product = await prisma.product.findUnique({
  where: { id: params.id },
  include: {
    variants: {
      include: { _count: { select: { orderItems: true } } }
    }
  }
}).catch(() => null);
```

- If `!product || product.vendorId !== vendor.id` → `redirect("/products")`
- Maps variants to `initialData.variants` with `hasOrders: variant._count.orderItems > 0`
- `images` field: `(product.aiImages as string[]) ?? []`
- Metadata: `"{product.title} — Luna Vendor"`

Renders:
```tsx
<div className="max-w-4xl">
  <h2 className="font-display text-display-md text-ink mb-6">Edit product</h2>
  <ProductForm productId={product.id} initialData={initialData} />
</div>
```

---

## Inventory Page — `(dashboard)/inventory/page.tsx`

RSC. Replaces the Phase 4a stub.

**Data:**
```ts
prisma.productVariant.findMany({
  where: { product: { vendorId: vendor.id } },
  include: { product: { select: { title: true } } },
  orderBy: [{ product: { title: "asc" } }, { size: "asc" }, { color: "asc" }]
}).catch(() => [])
```

**Layout:**
- Header: "Inventory" h2
- Table columns: Product | Size | Color | SKU | Stock
- Stock column: inline number input (`defaultValue={variant.stock}`) + "Save" button per row. The button calls `updateVariantStock(variantId, stock)` via a small client action (uses `useTransition` in a `StockInput` client component)
- Rows with `stock <= 3`: row gets `bg-coral/5`, stock value shown in `text-coral`
- Rows with `stock === 0`: stock shown in `text-coral font-medium` with "(Out of stock)" suffix

**`StockInput` client component** (in `inventory/components/StockInput.tsx`):
- `"use client"`, `useTransition`
- Renders the number input + Save button
- Calls `updateVariantStock` on save
- Shows "Saved ✓" feedback for 2s after success

---

## Settings Page — `(dashboard)/settings/page.tsx`

RSC. Replaces the Phase 4a stub.

**Data:** Fetches vendor via `getVendorByUserId(user.id)`.

**Two independent sections, each its own `<form>`:**

### Store Profile
Fields: storeName (text, required, 2–60 chars), description (textarea, optional), logoUrl (URL input + `<img>` preview)
Action: existing `updateVendorProfile({ description, logoUrl })` — note: `storeName` update requires a new field in this action. Add `storeName?: string` to `updateVendorProfile`.

### Payout Details
Field: ibanNumber (text, placeholder `AE07 0331 2345 6789 0123 456`)
Action: existing `updateVendorIBAN(iban)` from Phase 4a.

Both sections use a `SettingsForm` client component pattern — `"use client"`, `useTransition`, shows inline "Saved ✓" or error message after submission.

---

## Updating `updateVendorProfile` action

The existing `updateVendorProfile` in `apps/vendor/app/actions/vendor.ts` accepts `{ description?, logoUrl? }`. Extend it to also accept `storeName?: string`:

```ts
export async function updateVendorProfile(data: {
  storeName?: string;
  description?: string;
  logoUrl?: string;
}): Promise<{ success: boolean }> {
  // existing implementation, add storeName to the update object
}
```

---

## Shared Constraints

- All RSC pages that need vendor context call `safeCurrentUser()` + `getVendorByUserId()` — same pattern as dashboard layout
- The `(dashboard)/layout.tsx` already handles auth guards — RSC pages can assume an ACTIVE vendor exists; `null` returns are acceptable fallbacks
- All Prisma calls have `.catch()` fallbacks
- Category values must match what the customer browse pages use: `"OCCASION"`, `"EVERYDAY"`, `"TRAVEL"`, `"SPORT"`
- Product `aiImages` field is `Json` in the schema — always cast as `string[]` when reading, always serialize as `string[]` when writing
- SKU uniqueness: catch Prisma P2002 on `createProduct` and return a friendly error ("A variant with that size/color combination already exists")

---

## Design Tokens

Warm Oud palette applies throughout:
- `bg-ivory border-sand` — card/section backgrounds
- `text-gold` — CTAs, prices, active states
- `text-ink` — headings, primary text
- `text-mist` — secondary/label text
- `bg-coral/5 text-coral` — low stock, error states
- `bg-gold/20 text-gold` — ACTIVE badge
- `bg-sand text-mist` — DRAFT badge
