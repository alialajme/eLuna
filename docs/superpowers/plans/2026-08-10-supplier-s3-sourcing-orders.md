# Supplier S3 — Sourcing & Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a vendor browse ACTIVE supplier materials and place single-material orders, and let the owning supplier accept (committing stock), reject, ship, and complete them — closing the B2B loop and replacing the supplier "Incoming Orders — coming soon" seam.

**Architecture:** New `MaterialOrder` (header) + `MaterialOrderItem` (snapshotted line) Prisma models with a `MaterialOrderStatus` lifecycle. Vendor-app `Sourcing` section (browse + place + track) and supplier-app `Incoming Orders` section (fulfil), each with server actions scoped to the signed-in party. No payments (PO-record model) and no courier gateway (a free-text tracking note).

**Tech Stack:** Turborepo + pnpm@9, Next.js 15 App Router (React 19), Prisma + PostgreSQL (`prisma db push`, NO migration files), Clerk, Tailwind (Warm Oud tokens).

**Spec:** `docs/superpowers/specs/2026-08-10-supplier-s3-sourcing-orders-design.md`

---

## Repo Conventions (read before starting)

- **No automated test suite.** Each task's "test" step = regenerate the Prisma client when the schema
  changed, then `tsc --noEmit` and `next lint` on the touched app(s). That is the quality gate.
- Prisma: edit `packages/db/prisma/schema.prisma`, then `pnpm --filter @e-luna/db db:generate` +
  `pnpm --filter @e-luna/db db:push`. The `@e-luna/db` barrel re-exports `prisma` + model/enum types.
  Local Postgres at `localhost:5432` (role `postgres` / db `eluna`).
- Server actions return `{ success: boolean; error?: string }` (create also returns `id`).
- Scoping ids (`vendorId`/`supplierId`) are ALWAYS resolved server-side from the Clerk session, never a
  client param. Every mutation ownership-checks and guards the precursor status.
- DB reads use `.catch(() => fallback)`. Money is Prisma `Decimal` — convert with `Number(...)` for the
  client, pass a JS `number` into writes. `noUncheckedIndexedAccess` is ON.
- Vendor app helpers exist: `apps/vendor/app/lib/auth.ts` (`safeCurrentUser`), `lib/vendor.ts`
  (`getVendorByUserId` → returns `{ id, storeName, storeSlug, status, ... }`). Supplier app helpers:
  `apps/supplier/app/lib/auth.ts`, `lib/supplier.ts` (`getSupplierByUserId` → `{ id, companyName, status, ... }`).

---

## File Structure

**`packages/db/prisma/schema.prisma`** (modify) — `MaterialOrderStatus` enum, `MaterialOrder` +
`MaterialOrderItem` models, back-relations on `Vendor`/`Supplier`/`Material`.

**Vendor app (`apps/vendor`):**
- `app/actions/sourcing.ts` (create) — `createMaterialOrder`, `cancelMaterialOrder`.
- `app/(dashboard)/components/PlaceOrderForm.tsx` (create) — place-order island.
- `app/(dashboard)/components/CancelOrderButton.tsx` (create) — cancel island.
- `app/(dashboard)/sourcing/page.tsx` (create) — browse.
- `app/(dashboard)/sourcing/[id]/page.tsx` (create) — material detail + place.
- `app/(dashboard)/sourcing/orders/page.tsx` (create) — vendor's orders.
- `app/(dashboard)/sourcing/orders/[id]/page.tsx` (create) — order detail + cancel.
- `app/(dashboard)/components/Sidebar.tsx` (modify) — add Sourcing nav.

**Supplier app (`apps/supplier`):**
- `app/actions/incoming-order.ts` (create) — accept/reject/ship/complete.
- `app/(dashboard)/components/OrderActions.tsx` (create) — fulfil island.
- `app/(dashboard)/orders/page.tsx` (create) — incoming list.
- `app/(dashboard)/orders/[id]/page.tsx` (create) — incoming detail.
- `app/(dashboard)/components/Sidebar.tsx` (modify) — promote Incoming Orders.
- `app/(dashboard)/page.tsx` (modify) — live Incoming-orders card.

---

### Task 1: Prisma schema — MaterialOrder + MaterialOrderItem

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the enum**

Immediately after the existing `MaterialUnit` enum block, add:
```prisma
enum MaterialOrderStatus {
  PENDING
  ACCEPTED
  SHIPPED
  COMPLETED
  CANCELLED
  REJECTED
}
```

- [ ] **Step 2: Add the two models**

Immediately after the closing `}` of the `Material` model (the block ending with
`@@index([supplierId, status])`), add:
```prisma
model MaterialOrder {
  id           String              @id @default(cuid())
  vendorId     String
  supplierId   String
  status       MaterialOrderStatus @default(PENDING)
  total        Decimal             @db.Decimal(10, 2)
  note         String?
  trackingNote String?
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  vendor   Vendor              @relation(fields: [vendorId], references: [id])
  supplier Supplier            @relation(fields: [supplierId], references: [id])
  items    MaterialOrderItem[]

  @@index([vendorId])
  @@index([supplierId])
  @@index([supplierId, status])
  @@index([vendorId, status])
}

model MaterialOrderItem {
  id           String       @id @default(cuid())
  orderId      String
  materialId   String?
  materialName String
  unit         MaterialUnit
  unitPrice    Decimal      @db.Decimal(10, 2)
  quantity     Int

  order    MaterialOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  material Material?     @relation(fields: [materialId], references: [id], onDelete: SetNull)

  @@index([orderId])
  @@index([materialId])
}
```

- [ ] **Step 3: Add back-relations**

In `model Material`, add just before its closing `@@index([supplierId, status])` line (alongside the
`supplier Supplier @relation(...)` line):
```prisma
  orderItems MaterialOrderItem[]
```
In `model Vendor`, add a relation field alongside its other relations (e.g. after `shipments Shipment[]`):
```prisma
  materialOrders MaterialOrder[]
```
In `model Supplier`, add alongside the `materials Material[]` relation:
```prisma
  materialOrders MaterialOrder[]
```

- [ ] **Step 4: Regenerate + push**

Run:
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter @e-luna/db db:push
```
Expected: generate succeeds; `db:push` prints "Your database is now in sync with your Prisma schema."

- [ ] **Step 5: Verify tables**

Run:
```bash
PGPASSWORD=password psql -h localhost -U postgres -d eluna -tc "SELECT table_name FROM information_schema.tables WHERE table_name IN ('MaterialOrder','MaterialOrderItem') ORDER BY table_name;"
```
Expected: lists `MaterialOrder` and `MaterialOrderItem`. (If `psql` is unavailable, the Step 4 success message suffices.)

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add MaterialOrder, MaterialOrderItem, MaterialOrderStatus"
```

---

### Task 2: Vendor sourcing actions

**Files:**
- Create: `apps/vendor/app/actions/sourcing.ts`

- [ ] **Step 1: Write the actions file**

Create `apps/vendor/app/actions/sourcing.ts` with exactly:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

type ActiveVendor = { id: string };

async function resolveActiveVendor(): Promise<{ vendor: ActiveVendor } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { error: "Vendor not found" };
  if (vendor.status !== "ACTIVE") return { error: "Your vendor account is not active" };
  return { vendor: { id: vendor.id } };
}

export async function createMaterialOrder(
  materialId: string,
  quantity: number,
  note?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await resolveActiveVendor();
  if ("error" in auth) return { success: false, error: auth.error };

  const material = await prisma.material
    .findUnique({
      where: { id: materialId },
      include: { supplier: { select: { id: true, status: true } } },
    })
    .catch(() => null);

  if (!material || material.status !== "ACTIVE" || material.supplier.status !== "ACTIVE") {
    return { success: false, error: "Material is not available" };
  }
  if (!Number.isInteger(quantity) || quantity < material.moq) {
    return { success: false, error: `Minimum order quantity is ${material.moq}` };
  }
  if (quantity > material.stock) {
    return { success: false, error: `Only ${material.stock} in stock` };
  }
  const trimmedNote = note?.trim().slice(0, 500) || null;
  const unitPrice = Number(material.wholesalePrice);
  const total = unitPrice * quantity;

  try {
    const order = await prisma.materialOrder.create({
      data: {
        vendorId: auth.vendor.id,
        supplierId: material.supplier.id,
        total,
        note: trimmedNote,
        items: {
          create: [
            {
              materialId: material.id,
              materialName: material.name,
              unit: material.unit,
              unitPrice,
              quantity,
            },
          ],
        },
      },
      select: { id: true },
    });
    revalidatePath("/sourcing/orders");
    return { success: true, id: order.id };
  } catch {
    return { success: false, error: "Failed to place order" };
  }
}

export async function cancelMaterialOrder(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveVendor();
  if ("error" in auth) return { success: false, error: auth.error };

  const order = await prisma.materialOrder
    .findUnique({ where: { id: orderId }, select: { vendorId: true, status: true } })
    .catch(() => null);
  if (!order || order.vendorId !== auth.vendor.id) return { success: false, error: "Not found" };
  if (order.status !== "PENDING") return { success: false, error: "Only pending orders can be cancelled" };

  try {
    await prisma.materialOrder.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
    revalidatePath("/sourcing/orders");
    revalidatePath(`/sourcing/orders/${orderId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to cancel order" };
  }
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
pnpm --filter @e-luna/vendor exec tsc --noEmit
```
Expected: no errors. (`prisma.materialOrder` + the `material.supplier`/`material.moq`/`material.stock`
fields exist after Task 1's generate. `getVendorByUserId` returns a `status` field.)

- [ ] **Step 3: Commit**

```bash
git add apps/vendor/app/actions/sourcing.ts
git commit -m "feat(vendor): add sourcing actions (create/cancel material order)"
```

---

### Task 3: PlaceOrderForm island (vendor)

**Files:**
- Create: `apps/vendor/app/(dashboard)/components/PlaceOrderForm.tsx`

- [ ] **Step 1: Write the component**

Create `apps/vendor/app/(dashboard)/components/PlaceOrderForm.tsx` with exactly:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMaterialOrder } from "../../actions/sourcing";

type Props = {
  materialId: string;
  moq: number;
  stock: number;
  unitPrice: number;
  unit: string;
};

export function PlaceOrderForm({ materialId, moq, stock, unitPrice, unit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(String(moq));
  const [note, setNote] = useState("");

  const quantity = Number(qty);
  const validQty = Number.isInteger(quantity) && quantity >= moq && quantity <= stock;
  const total = validQty ? unitPrice * quantity : 0;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createMaterialOrder(materialId, quantity, note || undefined);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.push("/sourcing/orders");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-sand bg-ivory p-5 space-y-4">
      <div>
        <label htmlFor="order-qty" className="text-label text-mist block mb-2">
          QUANTITY (MOQ {moq}, {stock} available)
        </label>
        <input
          id="order-qty"
          type="number"
          min={moq}
          max={stock}
          step={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
        />
      </div>
      <div>
        <label htmlFor="order-note" className="text-label text-mist block mb-2">NOTE TO SUPPLIER (OPTIONAL)</label>
        <textarea
          id="order-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Delivery timing, specifications…"
          className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink resize-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-body-sm text-mist">Order total</span>
        <span className="font-display text-display-sm text-ink">
          AED {total.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
        </span>
      </div>
      <p className="text-body-xs text-mist">Priced at AED {unitPrice.toLocaleString("en-AE", { minimumFractionDigits: 2 })} / {unit.toLowerCase()}</p>
      {error && (
        <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-sm text-coral">{error}</div>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || !validQty}
        className="w-full rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
      >
        {isPending ? "Placing…" : "Place order"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run:
```bash
pnpm --filter @e-luna/vendor exec tsc --noEmit && pnpm --filter @e-luna/vendor lint
```
Expected: no type errors; lint clean.

- [ ] **Step 3: Commit**

```bash
git add "apps/vendor/app/(dashboard)/components/PlaceOrderForm.tsx"
git commit -m "feat(vendor): add PlaceOrderForm island"
```

---

### Task 4: Vendor sourcing browse + material detail pages

**Files:**
- Create: `apps/vendor/app/(dashboard)/sourcing/page.tsx`
- Create: `apps/vendor/app/(dashboard)/sourcing/[id]/page.tsx`

- [ ] **Step 1: `sourcing/page.tsx` (browse)**

```tsx
import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";

export const metadata: Metadata = { title: "Sourcing — Luna Vendor" };

const TYPES = [
  { label: "All", value: undefined },
  { label: "Fabric", value: "fabric" },
  { label: "Trim", value: "trim" },
  { label: "Lining", value: "lining" },
  { label: "Thread", value: "thread" },
  { label: "Hardware", value: "hardware" },
] as const;

type Props = { searchParams: Promise<{ type?: string }> };

export default async function SourcingPage({ searchParams }: Props) {
  const { type } = await searchParams;
  const typeFilter = TYPES.some((t) => t.value === type) ? type : undefined;

  const materials = await prisma.material
    .findMany({
      where: {
        status: "ACTIVE",
        supplier: { status: "ACTIVE" },
        ...(typeFilter ? { materialType: typeFilter } : {}),
      },
      include: { supplier: { select: { companyName: true } } },
      orderBy: { updatedAt: "desc" },
    })
    .catch(() => []);

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h2 className="font-display text-display-md text-ink">Sourcing</h2>
        <p className="text-body-sm text-mist">Order fabrics, trims, and hardware from Luna suppliers.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => {
          const active = (t.value ?? undefined) === typeFilter;
          const href = t.value ? `/sourcing?type=${t.value}` : "/sourcing";
          return (
            <Link key={t.label} href={href}
              className={`rounded-full px-4 py-1.5 text-body-sm transition-colors ${
                active ? "bg-ink text-ivory" : "border border-sand text-mist hover:border-ink hover:text-ink"
              }`}>
              {t.label}
            </Link>
          );
        })}
      </div>

      {materials.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-ivory py-16 text-center">
          <p className="text-body-md text-ink">No materials available</p>
          <p className="text-body-sm text-mist mt-1">Check back soon — suppliers are still listing stock.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {materials.map((m) => (
            <Link key={m.id} href={`/sourcing/${m.id}`}
              className="rounded-2xl border border-sand bg-ivory p-5 hover:border-ink transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body-md font-medium text-ink truncate">{m.name}</p>
                  <p className="text-body-xs text-mist capitalize">
                    {m.materialType}{m.color ? ` · ${m.color}` : ""}
                  </p>
                  <p className="text-body-xs text-mist mt-1">{m.supplier.companyName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-body-sm text-ink">
                    AED {Number(m.wholesalePrice).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                    <span className="text-mist"> / {m.unit.toLowerCase()}</span>
                  </p>
                  <p className="text-body-xs text-mist">MOQ {m.moq} · {m.stock} in stock</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `sourcing/[id]/page.tsx` (material detail + place order)**

```tsx
import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { PlaceOrderForm } from "../../components/PlaceOrderForm";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const material = await prisma.material
    .findUnique({ where: { id }, select: { name: true } })
    .catch(() => null);
  return { title: material ? `${material.name} — Sourcing` : "Sourcing — Luna Vendor" };
}

export default async function SourcingMaterialPage({ params }: Props) {
  const { id } = await params;

  const material = await prisma.material
    .findUnique({
      where: { id },
      include: { supplier: { select: { companyName: true, status: true } } },
    })
    .catch(() => null);

  if (!material || material.status !== "ACTIVE" || material.supplier.status !== "ACTIVE") notFound();

  const images = (material.images as string[]) ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/sourcing" className="text-body-sm text-mist hover:text-ink">← Back to sourcing</Link>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-display-md text-ink">{material.name}</h2>
            <p className="text-body-sm text-mist capitalize">
              {material.materialType}{material.color ? ` · ${material.color}` : ""}
            </p>
            <p className="text-body-sm text-mist mt-1">Supplied by {material.supplier.companyName}</p>
          </div>
          {material.composition && (
            <p className="text-body-sm text-ink"><span className="text-mist">Composition: </span>{material.composition}</p>
          )}
          {material.description && <p className="text-body-md text-ink">{material.description}</p>}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={material.name} className="h-24 w-24 rounded-lg object-cover border border-sand" />
              ))}
            </div>
          )}
        </div>

        <PlaceOrderForm
          materialId={material.id}
          moq={material.moq}
          stock={material.stock}
          unitPrice={Number(material.wholesalePrice)}
          unit={material.unit}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint**

Run:
```bash
pnpm --filter @e-luna/vendor exec tsc --noEmit && pnpm --filter @e-luna/vendor lint
```
Expected: no type errors; lint clean. (The `<img>` uses the same `eslint-disable-next-line` convention as
the rest of the repo for data/remote images.)

- [ ] **Step 4: Commit**

```bash
git add "apps/vendor/app/(dashboard)/sourcing/page.tsx" "apps/vendor/app/(dashboard)/sourcing/[id]/page.tsx"
git commit -m "feat(vendor): add sourcing browse and material detail pages"
```

---

### Task 5: Vendor orders list + detail (+ cancel)

**Files:**
- Create: `apps/vendor/app/(dashboard)/components/CancelOrderButton.tsx`
- Create: `apps/vendor/app/(dashboard)/sourcing/orders/page.tsx`
- Create: `apps/vendor/app/(dashboard)/sourcing/orders/[id]/page.tsx`

- [ ] **Step 1: `components/CancelOrderButton.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMaterialOrder } from "../../actions/sourcing";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    if (!confirm("Cancel this order?")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelMaterialOrder(orderId);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleCancel}
        disabled={isPending}
        className="rounded-full bg-coral/10 px-5 py-2.5 text-body-sm font-medium text-coral hover:bg-coral/20 transition-colors disabled:opacity-50"
      >
        {isPending ? "Cancelling…" : "Cancel order"}
      </button>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: `sourcing/orders/page.tsx`**

```tsx
import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";

export const metadata: Metadata = { title: "My material orders — Luna Vendor" };

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-sand text-mist",
  ACCEPTED: "bg-gold/20 text-gold",
  SHIPPED: "bg-gold/20 text-gold",
  COMPLETED: "bg-sage/20 text-sage",
  CANCELLED: "bg-coral/10 text-coral",
  REJECTED: "bg-coral/10 text-coral",
};

function label(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default async function MyMaterialOrdersPage() {
  const user = await safeCurrentUser();
  if (!user) return null;
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null;

  const orders = await prisma.materialOrder
    .findMany({
      where: { vendorId: vendor.id },
      include: { items: true, supplier: { select: { companyName: true } } },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-md text-ink">My material orders</h2>
        <Link href="/sourcing" className="text-body-sm text-mist hover:text-ink">Browse sourcing →</Link>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-ivory py-16 text-center">
          <p className="text-body-md text-ink">No orders yet</p>
          <p className="text-body-sm text-mist mt-1">Order materials from the Sourcing tab.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => {
            const first = o.items[0];
            return (
              <Link key={o.id} href={`/sourcing/orders/${o.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-sand bg-ivory p-5 hover:border-ink transition-colors">
                <div className="min-w-0">
                  <p className="text-body-md font-medium text-ink truncate">
                    {first ? `${first.quantity} × ${first.materialName}` : "Order"}
                  </p>
                  <p className="text-body-xs text-mist">{o.supplier.companyName}</p>
                </div>
                <div className="flex items-center gap-5 shrink-0">
                  <p className="text-body-sm text-ink">
                    AED {Number(o.total).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                  </p>
                  <span className={`rounded-full px-3 py-1 text-body-xs font-medium ${STATUS_CLASSES[o.status] ?? "bg-sand text-mist"}`}>
                    {label(o.status)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `sourcing/orders/[id]/page.tsx`**

```tsx
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../../lib/auth";
import { getVendorByUserId } from "../../../../lib/vendor";
import { CancelOrderButton } from "../../../components/CancelOrderButton";

export const metadata: Metadata = { title: "Order — Luna Vendor" };

type Props = { params: Promise<{ id: string }> };

function label(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default async function MaterialOrderDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const order = await prisma.materialOrder
    .findUnique({
      where: { id },
      include: { items: true, supplier: { select: { companyName: true } } },
    })
    .catch(() => null);

  if (!order || order.vendorId !== vendor.id) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/sourcing/orders" className="text-body-sm text-mist hover:text-ink">← Back to orders</Link>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">Order</h2>
          <p className="text-body-sm text-mist">{order.supplier.companyName}</p>
        </div>
        <span className="rounded-full bg-sand px-3 py-1 text-body-sm font-medium text-ink">{label(order.status)}</span>
      </div>

      <div className="rounded-2xl border border-sand bg-ivory p-5 space-y-3">
        {order.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between">
            <div>
              <p className="text-body-md text-ink">{it.materialName}</p>
              <p className="text-body-xs text-mist">
                {it.quantity} {it.unit.toLowerCase()} × AED {Number(it.unitPrice).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <p className="text-body-sm text-ink">
              AED {(Number(it.unitPrice) * it.quantity).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
            </p>
          </div>
        ))}
        <div className="border-t border-sand pt-3 flex items-center justify-between">
          <span className="text-body-sm font-medium text-ink">Total</span>
          <span className="font-display text-display-sm text-ink">
            AED {Number(order.total).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {order.note && (
        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-label text-mist mb-1">YOUR NOTE</p>
          <p className="text-body-sm text-ink">{order.note}</p>
        </div>
      )}
      {order.trackingNote && (
        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-label text-mist mb-1">SUPPLIER TRACKING</p>
          <p className="text-body-sm text-ink">{order.trackingNote}</p>
        </div>
      )}

      {order.status === "PENDING" && <CancelOrderButton orderId={order.id} />}
    </div>
  );
}
```

- [ ] **Step 4: Type-check + lint**

Run:
```bash
pnpm --filter @e-luna/vendor exec tsc --noEmit && pnpm --filter @e-luna/vendor lint
```
Expected: no type errors; lint clean.

- [ ] **Step 5: Commit**

```bash
git add "apps/vendor/app/(dashboard)/components/CancelOrderButton.tsx" "apps/vendor/app/(dashboard)/sourcing/orders"
git commit -m "feat(vendor): add material orders list and detail with cancel"
```

---

### Task 6: Vendor Sidebar — add Sourcing

**Files:**
- Modify: `apps/vendor/app/(dashboard)/components/Sidebar.tsx`

- [ ] **Step 1: Insert the Sourcing nav item**

In `apps/vendor/app/(dashboard)/components/Sidebar.tsx`, change the `NAV_ITEMS` array by inserting a
Sourcing entry after the Inventory line. It currently reads:
```tsx
  { icon: "🏭", label: "Inventory", href: "/inventory" },
  { icon: "📈", label: "Analytics", href: "/analytics" },
```
Change to:
```tsx
  { icon: "🏭", label: "Inventory", href: "/inventory" },
  { icon: "🧶", label: "Sourcing", href: "/sourcing" },
  { icon: "📈", label: "Analytics", href: "/analytics" },
```
Change nothing else — the existing `isActive` logic (`href === "/" ? pathname === "/" : pathname.startsWith(href)`) highlights Sourcing on `/sourcing` and its subpaths correctly.

- [ ] **Step 2: Type-check + lint**

Run:
```bash
pnpm --filter @e-luna/vendor exec tsc --noEmit && pnpm --filter @e-luna/vendor lint
```
Expected: no type errors; lint clean.

- [ ] **Step 3: Commit**

```bash
git add "apps/vendor/app/(dashboard)/components/Sidebar.tsx"
git commit -m "feat(vendor): add Sourcing to the dashboard nav"
```

---

### Task 7: Supplier incoming-order actions

**Files:**
- Create: `apps/supplier/app/actions/incoming-order.ts`

- [ ] **Step 1: Write the actions file**

Create `apps/supplier/app/actions/incoming-order.ts` with exactly:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getSupplierByUserId } from "../lib/supplier";

type ActiveSupplier = { id: string };

async function resolveActiveSupplier(): Promise<{ supplier: ActiveSupplier } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return { error: "Not a supplier" };
  if (supplier.status !== "ACTIVE") return { error: "Your supplier account is not active" };
  return { supplier: { id: supplier.id } };
}

// Loads an order owned by the active supplier and asserts its current status.
async function loadOwnedOrder(
  orderId: string,
  supplierId: string
): Promise<
  | { order: { id: string; status: string; items: { materialId: string | null; quantity: number }[] } }
  | { error: string }
> {
  const order = await prisma.materialOrder
    .findUnique({
      where: { id: orderId },
      select: { id: true, supplierId: true, status: true, items: { select: { materialId: true, quantity: true } } },
    })
    .catch(() => null);
  if (!order || order.supplierId !== supplierId) return { error: "Not found" };
  return { order: { id: order.id, status: order.status, items: order.items } };
}

export async function acceptMaterialOrder(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const loaded = await loadOwnedOrder(orderId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  if (loaded.order.status !== "PENDING") return { success: false, error: "Order is not pending" };

  const line = loaded.order.items[0];
  if (!line || !line.materialId) return { success: false, error: "Material no longer available" };
  const materialId = line.materialId;
  const quantity = line.quantity;

  try {
    await prisma.$transaction(async (tx) => {
      // Race-safe stock commit: only decrements if enough stock remains.
      const updated = await tx.material.updateMany({
        where: { id: materialId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (updated.count === 0) throw new Error("INSUFFICIENT_STOCK");
      await tx.materialOrder.update({ where: { id: orderId }, data: { status: "ACCEPTED" } });
    });
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_STOCK") {
      return { success: false, error: "Insufficient stock to accept this order" };
    }
    return { success: false, error: "Failed to accept order" };
  }
}

export async function rejectMaterialOrder(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const loaded = await loadOwnedOrder(orderId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  if (loaded.order.status !== "PENDING") return { success: false, error: "Order is not pending" };

  try {
    await prisma.materialOrder.update({ where: { id: orderId }, data: { status: "REJECTED" } });
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to reject order" };
  }
}

export async function shipMaterialOrder(
  orderId: string,
  trackingNote?: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const loaded = await loadOwnedOrder(orderId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  if (loaded.order.status !== "ACCEPTED") return { success: false, error: "Order is not accepted" };

  const note = trackingNote?.trim().slice(0, 200) || null;

  try {
    await prisma.materialOrder.update({
      where: { id: orderId },
      data: { status: "SHIPPED", trackingNote: note },
    });
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark shipped" };
  }
}

export async function completeMaterialOrder(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const loaded = await loadOwnedOrder(orderId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  if (loaded.order.status !== "SHIPPED") return { success: false, error: "Order is not shipped" };

  try {
    await prisma.materialOrder.update({ where: { id: orderId }, data: { status: "COMPLETED" } });
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to complete order" };
  }
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit
```
Expected: no errors. (`order.status` is the `MaterialOrderStatus` enum, compared against string literals —
assignable. `prisma.materialOrder`/`tx.material.updateMany` exist after Task 1's generate.)

- [ ] **Step 3: Commit**

```bash
git add apps/supplier/app/actions/incoming-order.ts
git commit -m "feat(supplier): add incoming-order fulfilment actions (accept/reject/ship/complete)"
```

---

### Task 8: OrderActions island (supplier)

**Files:**
- Create: `apps/supplier/app/(dashboard)/components/OrderActions.tsx`

- [ ] **Step 1: Write the component**

Create `apps/supplier/app/(dashboard)/components/OrderActions.tsx` with exactly:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptMaterialOrder,
  rejectMaterialOrder,
  shipMaterialOrder,
  completeMaterialOrder,
} from "../../actions/incoming-order";

type Props = {
  orderId: string;
  status: string;
};

const primaryBtn =
  "rounded-full bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50";
const dangerBtn =
  "rounded-full bg-coral/10 px-5 py-2.5 text-body-sm font-medium text-coral hover:bg-coral/20 transition-colors disabled:opacity-50";

export function OrderActions({ orderId, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [trackingNote, setTrackingNote] = useState("");

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {status === "PENDING" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isPending} className={primaryBtn}
            onClick={() => run(() => acceptMaterialOrder(orderId))}>Accept order</button>
          <button type="button" disabled={isPending} className={dangerBtn}
            onClick={() => run(() => rejectMaterialOrder(orderId))}>Reject</button>
        </div>
      )}

      {status === "ACCEPTED" && (
        <div className="space-y-2">
          <label htmlFor="tracking" className="text-label text-mist block">TRACKING NOTE (OPTIONAL)</label>
          <input id="tracking" value={trackingNote} maxLength={200}
            onChange={(e) => setTrackingNote(e.target.value)}
            placeholder="Courier + tracking number, or pickup details"
            className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink" />
          <button type="button" disabled={isPending} className={primaryBtn}
            onClick={() => run(() => shipMaterialOrder(orderId, trackingNote || undefined))}>Mark shipped</button>
        </div>
      )}

      {status === "SHIPPED" && (
        <button type="button" disabled={isPending} className={primaryBtn}
          onClick={() => run(() => completeMaterialOrder(orderId))}>Mark completed</button>
      )}

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: no type errors; lint clean.

- [ ] **Step 3: Commit**

```bash
git add "apps/supplier/app/(dashboard)/components/OrderActions.tsx"
git commit -m "feat(supplier): add OrderActions fulfilment island"
```

---

### Task 9: Supplier incoming orders list + detail pages

**Files:**
- Create: `apps/supplier/app/(dashboard)/orders/page.tsx`
- Create: `apps/supplier/app/(dashboard)/orders/[id]/page.tsx`

- [ ] **Step 1: `orders/page.tsx`**

```tsx
import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";

export const metadata: Metadata = { title: "Incoming orders — Luna Supplier" };

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-sand text-mist",
  ACCEPTED: "bg-gold/20 text-gold",
  SHIPPED: "bg-gold/20 text-gold",
  COMPLETED: "bg-sage/20 text-sage",
  CANCELLED: "bg-coral/10 text-coral",
  REJECTED: "bg-coral/10 text-coral",
};

function label(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

type Props = { searchParams: Promise<{ status?: string }> };

export default async function IncomingOrdersPage({ searchParams }: Props) {
  const { status: statusParam } = await searchParams;

  const user = await safeCurrentUser();
  if (!user) return null;
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return null;

  const validStatuses = ["PENDING", "ACCEPTED", "SHIPPED", "COMPLETED", "CANCELLED", "REJECTED"];
  const statusFilter = validStatuses.includes(statusParam ?? "") ? statusParam : undefined;

  const orders = await prisma.materialOrder
    .findMany({
      where: { supplierId: supplier.id, ...(statusFilter ? { status: statusFilter as "PENDING" } : {}) },
      include: { items: true, vendor: { select: { storeName: true } } },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  const tabs = [
    { label: "All", value: undefined },
    { label: "Pending", value: "PENDING" },
    { label: "Accepted", value: "ACCEPTED" },
    { label: "Shipped", value: "SHIPPED" },
    { label: "Completed", value: "COMPLETED" },
  ] as const;

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Incoming orders</h2>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = (t.value ?? undefined) === statusFilter;
          const href = t.value ? `/orders?status=${t.value}` : "/orders";
          return (
            <Link key={t.label} href={href}
              className={`rounded-full px-4 py-1.5 text-body-sm transition-colors ${
                active ? "bg-ink text-ivory" : "border border-sand text-mist hover:border-ink hover:text-ink"
              }`}>
              {t.label}
            </Link>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-ivory py-16 text-center">
          <p className="text-body-md text-ink">No orders</p>
          <p className="text-body-sm text-mist mt-1">Orders from vendors will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => {
            const first = o.items[0];
            return (
              <Link key={o.id} href={`/orders/${o.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-sand bg-ivory p-5 hover:border-ink transition-colors">
                <div className="min-w-0">
                  <p className="text-body-md font-medium text-ink truncate">
                    {first ? `${first.quantity} × ${first.materialName}` : "Order"}
                  </p>
                  <p className="text-body-xs text-mist">{o.vendor.storeName}</p>
                </div>
                <div className="flex items-center gap-5 shrink-0">
                  <p className="text-body-sm text-ink">
                    AED {Number(o.total).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                  </p>
                  <span className={`rounded-full px-3 py-1 text-body-xs font-medium ${STATUS_CLASSES[o.status] ?? "bg-sand text-mist"}`}>
                    {label(o.status)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `orders/[id]/page.tsx`**

```tsx
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getSupplierByUserId } from "../../../lib/supplier";
import { OrderActions } from "../../components/OrderActions";

export const metadata: Metadata = { title: "Order — Luna Supplier" };

type Props = { params: Promise<{ id: string }> };

function label(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default async function IncomingOrderDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) redirect("/");

  const order = await prisma.materialOrder
    .findUnique({
      where: { id },
      include: { items: true, vendor: { select: { storeName: true } } },
    })
    .catch(() => null);

  if (!order || order.supplierId !== supplier.id) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/orders" className="text-body-sm text-mist hover:text-ink">← Back to orders</Link>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">Order</h2>
          <p className="text-body-sm text-mist">From {order.vendor.storeName}</p>
        </div>
        <span className="rounded-full bg-sand px-3 py-1 text-body-sm font-medium text-ink">{label(order.status)}</span>
      </div>

      <div className="rounded-2xl border border-sand bg-ivory p-5 space-y-3">
        {order.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between">
            <div>
              <p className="text-body-md text-ink">{it.materialName}</p>
              <p className="text-body-xs text-mist">
                {it.quantity} {it.unit.toLowerCase()} × AED {Number(it.unitPrice).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <p className="text-body-sm text-ink">
              AED {(Number(it.unitPrice) * it.quantity).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
            </p>
          </div>
        ))}
        <div className="border-t border-sand pt-3 flex items-center justify-between">
          <span className="text-body-sm font-medium text-ink">Total</span>
          <span className="font-display text-display-sm text-ink">
            AED {Number(order.total).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {order.note && (
        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-label text-mist mb-1">VENDOR NOTE</p>
          <p className="text-body-sm text-ink">{order.note}</p>
        </div>
      )}
      {order.trackingNote && (
        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-label text-mist mb-1">TRACKING</p>
          <p className="text-body-sm text-ink">{order.trackingNote}</p>
        </div>
      )}

      <OrderActions orderId={order.id} status={order.status} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: no type errors; lint clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/supplier/app/(dashboard)/orders"
git commit -m "feat(supplier): add incoming orders list and detail pages"
```

---

### Task 10: Supplier Sidebar + dashboard card

**Files:**
- Modify: `apps/supplier/app/(dashboard)/components/Sidebar.tsx`
- Modify: `apps/supplier/app/(dashboard)/page.tsx`

- [ ] **Step 1: Sidebar — promote Incoming Orders, remove the SOON block**

In `apps/supplier/app/(dashboard)/components/Sidebar.tsx`:

(a) Change `NAV_ITEMS` from:
```tsx
const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard", href: "/" },
  { icon: "🧵", label: "Materials", href: "/materials" },
] as const;
```
to:
```tsx
const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard", href: "/" },
  { icon: "🧵", label: "Materials", href: "/materials" },
  { icon: "📋", label: "Incoming Orders", href: "/orders" },
] as const;
```

(b) Delete the `SOON_ITEMS` constant entirely:
```tsx
const SOON_ITEMS = [
  { icon: "📋", label: "Incoming Orders" },
] as const;
```

(c) Delete the SOON rendering block inside the `<nav>` (the `.map` over `SOON_ITEMS`):
```tsx
        {SOON_ITEMS.map(({ icon, label }) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-body-md text-mist/50"
          >
            <span className="flex items-center gap-3">
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </span>
            <span className="text-body-xs text-mist/40">soon</span>
          </div>
        ))}
```
Leave the `NAV_ITEMS.map(...)` block and everything else unchanged.

- [ ] **Step 2: Dashboard — make the Incoming-orders card live**

In `apps/supplier/app/(dashboard)/page.tsx`:

(a) After the existing `const materialCount = await prisma.material.count(...)` block, add:
```tsx
  const pendingOrderCount = await prisma.materialOrder
    .count({ where: { supplierId: supplier.id, status: "PENDING" } })
    .catch(() => 0);
```

(b) Replace the second card — the `<div>` with the "COMING SOON" label and "Incoming orders" heading —
with:
```tsx
        <Link
          href="/orders"
          className="rounded-2xl border border-sand bg-ivory p-6 hover:border-ink transition-colors"
        >
          <p className="text-label text-gold mb-1">ORDERS</p>
          <p className="text-body-md font-medium text-ink">Incoming orders</p>
          <p className="text-body-sm text-mist mt-1">
            {pendingOrderCount === 0
              ? "Vendor material orders will appear here."
              : `${pendingOrderCount} pending order${pendingOrderCount === 1 ? "" : "s"} awaiting your response →`}
          </p>
        </Link>
```
Leave the first (Materials) card and the supply-categories section unchanged.

- [ ] **Step 3: Type-check + lint**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: no type errors; lint clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/supplier/app/(dashboard)/components/Sidebar.tsx" "apps/supplier/app/(dashboard)/page.tsx"
git commit -m "feat(supplier): promote Incoming Orders nav + live dashboard card"
```

---

### Task 11: Full-workspace verification

- [ ] **Step 1: Regenerate client + full type-check**

Run:
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter "@e-luna/*" exec tsc --noEmit
```
Expected: no type errors across all packages/apps.

- [ ] **Step 2: Full lint**

Run:
```bash
pnpm lint
```
Expected: all apps lint clean (pre-existing `<img>` warnings in the customer app — and the one added on
the sourcing material page, which carries an `eslint-disable-next-line` — are acceptable).

- [ ] **Step 3: Commit any generated drift (only if present)**

```bash
git add -A && git commit -m "chore: sync generated artifacts for supplier S3" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- `MaterialOrderStatus` + `MaterialOrder` + `MaterialOrderItem` + 3 back-relations → Task 1. ✅
- Vendor `createMaterialOrder` (ACTIVE material+supplier, qty∈[moq,stock], snapshot, PENDING, no stock
  change) + `cancelMaterialOrder` (owner, PENDING→CANCELLED) → Task 2. ✅
- Vendor browse (type filter, ACTIVE+ACTIVE) + material detail (`notFound` unless ACTIVE) + PlaceOrderForm
  → Tasks 3, 4. ✅
- Vendor orders list + detail (ownership→`notFound`) + Cancel while PENDING → Task 5. ✅
- Vendor Sidebar Sourcing link → Task 6. ✅
- Supplier accept (transactional race-safe stock commit) / reject / ship (tracking note) / complete →
  Task 7. ✅
- Supplier OrderActions island (status-appropriate buttons) → Task 8. ✅
- Supplier incoming list (status filter) + detail (ownership→`notFound`) → Task 9. ✅
- Supplier Sidebar promote + live dashboard card (pending count) → Task 10. ✅
- Verification (generate + tsc + lint) → each task + Task 11. ✅
- Deferred (payments, courier gateway, carts) → correctly absent. ✅

**Placeholder scan:** No TBD/TODO; every code step has full contents or an exact anchored edit.

**Type consistency:** `createMaterialOrder(materialId, quantity, note?)` (Task 2) called by
`PlaceOrderForm` (Task 3). `cancelMaterialOrder(orderId)` (Task 2) called by `CancelOrderButton` (Task 5).
The four supplier actions (`acceptMaterialOrder`/`rejectMaterialOrder`/`shipMaterialOrder`/
`completeMaterialOrder`, Task 7) are imported by `OrderActions` (Task 8). `MaterialOrder`/
`MaterialOrderItem`/`prisma.materialOrder` used across Tasks 2, 5, 7, 9 — available after Task 1 generate.
`order.status` (Prisma `MaterialOrderStatus`) is compared against and passed as `string` in the list/detail
pages and the `OrderActions`/`status` prop — assignable. `getVendorByUserId`→`storeName`/`status`,
`getSupplierByUserId`→`companyName`/`status` match their usages.

**Scope:** one cohesive B2B-ordering feature; the two apps are coupled only through the shared
`MaterialOrder` model — a single plan is appropriate.
