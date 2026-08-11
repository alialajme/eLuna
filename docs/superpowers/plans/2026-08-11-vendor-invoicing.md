# Vendor Invoicing (customer orders) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vendor issues a UAE tax-compliant invoice (inclusive 5% VAT) for their items in a customer `Order`; the customer views/downloads it. Reuses a shared `@e-luna/einvoice` gateway (extracted from the supplier app) and a shared `TaxInvoiceDocument` UI component.

**Architecture:** Extract the e-invoice gateway to `@e-luna/einvoice` (generalized `seller`/`buyer`) and repoint the supplier. Add a shared printable `TaxInvoiceDocument` to `@e-luna/ui`. New `OrderInvoice` model (`@@unique([orderId, vendorId])`) + `Vendor.trn`. Vendor-app actions/pages to issue; customer-app pages to view.

**Tech Stack:** Turborepo + pnpm@9, Next.js 15, Prisma + PostgreSQL (`prisma db push`, NO migration files), Clerk, Tailwind. Spec: `docs/superpowers/specs/2026-08-11-vendor-invoicing-design.md`.

---

## Repo Conventions (read before starting)
- **No automated test suite** — each task's "test" = `db:generate` (when schema changed) + `tsc --noEmit` + `next lint` on touched packages/apps.
- Prisma: `db push`, NO migrations. Local Postgres localhost:5432/eluna, role `postgres`/`password`.
- Actions return `{ success, error? }` (create also `id`); scope ids server-resolved (never client params); DB reads `.catch(() => fallback)`. Money `Decimal` ↔ `Number(...)`; **inclusive VAT:** `net = round(gross/1.05,2)`, `vat = round(gross-net,2)`, `total = gross`.
- Workspace packages export raw TS (like `@e-luna/db`); apps list them in `dependencies` + `transpilePackages`.

---

### Task 1: Extract `@e-luna/einvoice` package + repoint supplier

**Files:** Create `packages/einvoice/{package.json,tsconfig.json,src/{gateway,simulated,fta,config,factory,index}.ts}`; modify `apps/supplier/app/actions/invoice.ts`, `apps/supplier/package.json`, `apps/supplier/next.config.ts`; delete `apps/supplier/app/lib/einvoice/`.

- [ ] **Step 1: `packages/einvoice/package.json`**
```json
{
  "name": "@e-luna/einvoice",
  "version": "0.0.1",
  "private": true,
  "exports": { ".": "./src/index.ts" },
  "devDependencies": {
    "@e-luna/config": "workspace:*",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: `packages/einvoice/tsconfig.json`**
```json
{
  "extends": "@e-luna/config/tsconfig/base",
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: `packages/einvoice/src/gateway.ts`** (generalized seller/buyer)
```ts
export type InvoiceLine = { description: string; quantity: number; unitPrice: number; lineTotal: number };

export type IssueParams = {
  invoiceNumber: string;
  seller: { name: string; trn: string };
  buyer: { name: string };
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  lines: InvoiceLine[];
};

export type IssueResult =
  | { status: "issued"; externalRef: string | null }
  | { status: "failed"; error: string };

export interface EInvoiceGateway {
  issue(params: IssueParams): Promise<IssueResult>;
}
```

- [ ] **Step 4: `packages/einvoice/src/simulated.ts`**
```ts
import type { EInvoiceGateway, IssueParams, IssueResult } from "./gateway";

// The no-keys default. Issues the invoice locally — the printable invoice page IS the
// compliant document. No network; never fails.
export class SimulatedEInvoice implements EInvoiceGateway {
  async issue(_params: IssueParams): Promise<IssueResult> {
    return { status: "issued", externalRef: null };
  }
}
```

- [ ] **Step 5: `packages/einvoice/src/config.ts`**
```ts
export const hasFtaAccessPoint = () =>
  !!process.env.FTA_ACCESS_POINT_URL && !!process.env.FTA_API_KEY;
```

- [ ] **Step 6: `packages/einvoice/src/fta.ts`**
```ts
import type { EInvoiceGateway, IssueParams, IssueResult } from "./gateway";

// Representative scaffold for a real UAE FTA / Peppol Access Point.
// Author-complete but credential-gated. See docs/deployment/einvoicing.md.
export class FtaEInvoice implements EInvoiceGateway {
  async issue(params: IssueParams): Promise<IssueResult> {
    const url = process.env.FTA_ACCESS_POINT_URL;
    const key = process.env.FTA_API_KEY;
    if (!url || !key) return { status: "failed", error: "FTA Access Point not configured" };

    // TODO(operator): map `params` to a Peppol UBL 2.1 Tax Invoice, POST to the Access Point
    // with auth, and return the clearance / transmission id as `externalRef`.
    return { status: "failed", error: "FtaEInvoice not implemented" };
  }
}
```

- [ ] **Step 7: `packages/einvoice/src/factory.ts`**
```ts
import type { EInvoiceGateway } from "./gateway";
import { SimulatedEInvoice } from "./simulated";
import { FtaEInvoice } from "./fta";
import { hasFtaAccessPoint } from "./config";

/** Never throws. No FTA credentials → SimulatedEInvoice (local compliant issuing). */
export function getEInvoiceGateway(): EInvoiceGateway {
  return hasFtaAccessPoint() ? new FtaEInvoice() : new SimulatedEInvoice();
}
```

- [ ] **Step 8: `packages/einvoice/src/index.ts`**
```ts
export type { EInvoiceGateway, IssueParams, IssueResult, InvoiceLine } from "./gateway";
export { SimulatedEInvoice } from "./simulated";
export { FtaEInvoice } from "./fta";
export { hasFtaAccessPoint } from "./config";
export { getEInvoiceGateway } from "./factory";
```

- [ ] **Step 9: Delete the supplier's copy + repoint**

Delete the directory:
```bash
git rm -r apps/supplier/app/lib/einvoice
```
In `apps/supplier/app/actions/invoice.ts`, change the import:
```ts
import { getEInvoiceGateway } from "@e-luna/einvoice";
```
(was `from "../lib/einvoice/factory"`). Then change the `.issue({...})` call so it matches the generalized
params — `supplier`→`seller`, `vendor`→`buyer`, and map the lines to the generic shape. Replace:
```ts
    const result = await getEInvoiceGateway().issue({
      invoiceNumber,
      supplier: { name: supplier.companyName, trn: supplier.trn },
      vendor: { name: order.vendor.storeName },
      subtotal, vatRate, vatAmount, total, lines,
    });
```
with:
```ts
    const result = await getEInvoiceGateway().issue({
      invoiceNumber,
      seller: { name: supplier.companyName, trn: supplier.trn },
      buyer: { name: order.vendor.storeName },
      subtotal, vatRate, vatAmount, total,
      lines: lines.map((l) => ({ description: l.name, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
    });
```
(The rich `lines` — with `unit` — are still stored on `MaterialInvoice.lines`; only the gateway call maps to the generic shape.)

- [ ] **Step 10: Supplier deps**

In `apps/supplier/package.json` `dependencies`, add after `"@e-luna/ai"`:
```json
    "@e-luna/einvoice": "workspace:*",
```
In `apps/supplier/next.config.ts` `transpilePackages`, add `"@e-luna/einvoice"`.

- [ ] **Step 11: Install + verify**
```bash
pnpm install
pnpm exec tsc --noEmit -p packages/einvoice/tsconfig.json && pnpm --filter @e-luna/supplier exec tsc --noEmit
```
Expected: both clean (the supplier still compiles against the extracted package).

- [ ] **Step 12: Commit**
```bash
git add packages/einvoice apps/supplier/app/actions/invoice.ts apps/supplier/package.json apps/supplier/next.config.ts pnpm-lock.yaml
git commit -m "refactor(einvoice): extract shared @e-luna/einvoice gateway + repoint supplier"
```

---

### Task 2: Shared `TaxInvoiceDocument` (`@e-luna/ui`)

**Files:** Create `packages/ui/src/components/TaxInvoiceDocument.tsx`; modify `packages/ui/src/index.ts` (export).

- [ ] **Step 1: `packages/ui/src/components/TaxInvoiceDocument.tsx`**
```tsx
type Line = { description: string; quantity: number; unitPrice: number; lineTotal: number };

export type TaxInvoiceProps = {
  invoiceNumber: string;
  issuedAt: string;
  seller: { name: string; trn: string };
  buyer: { name: string };
  lines: Line[];
  subtotal: number;
  vatAmount: number;
  total: number;
  externalRef?: string | null;
};

const aed = (n: number) => `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;

export function TaxInvoiceDocument(props: TaxInvoiceProps) {
  const { invoiceNumber, issuedAt, seller, buyer, lines, subtotal, vatAmount, total, externalRef } = props;
  return (
    <div className="rounded-2xl border border-sand bg-white p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-display-md text-ink">Tax Invoice</p>
          <p className="text-body-sm text-mist">{invoiceNumber}</p>
        </div>
        <div className="text-right text-body-sm">
          <p className="font-display text-display-sm text-gold">✦ Luna</p>
          <p className="text-mist">{issuedAt}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-y border-sand py-4 text-body-sm">
        <div>
          <p className="text-label text-mist mb-1">FROM</p>
          <p className="text-ink font-medium">{seller.name}</p>
          <p className="text-mist">TRN: {seller.trn}</p>
        </div>
        <div>
          <p className="text-label text-mist mb-1">BILL TO</p>
          <p className="text-ink font-medium">{buyer.name}</p>
        </div>
      </div>

      <table className="w-full text-body-sm">
        <thead>
          <tr className="border-b border-sand text-body-xs uppercase tracking-wide text-mist">
            <th className="py-2 text-left font-medium">Item</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Unit price</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-sand/60">
              <td className="py-2 text-ink">{l.description}</td>
              <td className="py-2 text-right text-mist">{l.quantity}</td>
              <td className="py-2 text-right text-mist">{aed(l.unitPrice)}</td>
              <td className="py-2 text-right text-ink">{aed(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-56 space-y-1 text-body-sm">
        <div className="flex justify-between"><span className="text-mist">Net</span><span className="text-ink">{aed(subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-mist">VAT (5%)</span><span className="text-ink">{aed(vatAmount)}</span></div>
        <div className="flex justify-between border-t border-sand pt-1 font-medium">
          <span className="text-ink">Total</span><span className="text-ink">{aed(total)}</span>
        </div>
      </div>

      {externalRef && <p className="text-body-xs text-mist">FTA / Peppol reference: {externalRef}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Export it** — add to `packages/ui/src/index.ts`:
```ts
export { TaxInvoiceDocument } from "./components/TaxInvoiceDocument";
export type { TaxInvoiceProps } from "./components/TaxInvoiceDocument";
```

- [ ] **Step 3: Type-check**
```bash
pnpm exec tsc --noEmit -p packages/ui/tsconfig.json
```
Expected: no errors. (If `@e-luna/ui` has no tsconfig path, verify via `pnpm --filter @e-luna/ui exec tsc --noEmit`.)

- [ ] **Step 4: Commit**
```bash
git add packages/ui/src/components/TaxInvoiceDocument.tsx packages/ui/src/index.ts
git commit -m "feat(ui): shared printable TaxInvoiceDocument component"
```

---

### Task 3: Prisma — Vendor.trn + OrderInvoice

**Files:** Modify `packages/db/prisma/schema.prisma`

- [ ] **Step 1: `Vendor.trn`** — in `model Vendor`, add alongside `ibanNumber String?`:
```prisma
  trn            String?
```

- [ ] **Step 2: `OrderInvoice` model** — add after the `MaterialInvoice` model's closing `}`:
```prisma
model OrderInvoice {
  id            String   @id @default(cuid())
  invoiceNumber String   @unique
  orderId       String
  vendorId      String
  vendorName    String
  vendorTRN     String
  customerName  String
  subtotal      Decimal  @db.Decimal(10, 2)
  vatRate       Decimal  @default(0.05) @db.Decimal(4, 2)
  vatAmount     Decimal  @db.Decimal(10, 2)
  total         Decimal  @db.Decimal(10, 2)
  lines         Json
  externalRef   String?
  issuedAt      DateTime @default(now())
  createdAt     DateTime @default(now())

  order  Order  @relation(fields: [orderId], references: [id])
  vendor Vendor @relation(fields: [vendorId], references: [id])

  @@unique([orderId, vendorId])
  @@index([vendorId])
  @@index([vendorId, issuedAt])
}
```

- [ ] **Step 3: Back-relations** — in `model Order` add (alongside `items OrderItem[]`):
```prisma
  invoices OrderInvoice[]
```
In `model Vendor` add (alongside its relations, e.g. after `payouts Payout[]`):
```prisma
  orderInvoices OrderInvoice[]
```

- [ ] **Step 4: Generate + push**
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter @e-luna/db db:push
```
Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 5: Commit**
```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add Vendor.trn + OrderInvoice (per vendor per order)"
```

---

### Task 4: Vendor invoice actions

**Files:** Create `apps/vendor/app/actions/invoice.ts`

- [ ] **Step 1: Write the actions**
```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { getEInvoiceGateway } from "@e-luna/einvoice";
import { safeCurrentUser } from "../lib/auth";

type ActiveVendor = { id: string; storeName: string; storeSlug: string; trn: string | null };

async function resolveActiveVendor(): Promise<{ vendor: ActiveVendor } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const vendor = await prisma.vendor
    .findUnique({
      where: { userId: user.id },
      select: { id: true, storeName: true, storeSlug: true, status: true, trn: true },
    })
    .catch(() => null);
  if (!vendor) return { error: "Vendor not found" };
  if (vendor.status !== "ACTIVE") return { error: "Your vendor account is not active" };
  return { vendor: { id: vendor.id, storeName: vendor.storeName, storeSlug: vendor.storeSlug, trn: vendor.trn } };
}

export async function setVendorTrn(trn: string): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveVendor();
  if ("error" in auth) return { success: false, error: auth.error };
  const clean = trn.trim();
  if (!/^\d{15}$/.test(clean)) return { success: false, error: "TRN must be 15 digits" };
  try {
    await prisma.vendor.update({ where: { id: auth.vendor.id }, data: { trn: clean } });
    revalidatePath("/settings");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to save TRN" };
  }
}

const INVOICEABLE = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

export async function issueOrderInvoice(
  orderId: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await resolveActiveVendor();
  if ("error" in auth) return { success: false, error: auth.error };
  const vendor = auth.vendor;
  if (!vendor.trn) return { success: false, error: "Set your TRN in Settings before issuing invoices" };

  const order = await prisma.order
    .findUnique({
      where: { id: orderId },
      select: {
        status: true,
        address: { select: { fullName: true } },
        items: {
          where: { vendorId: vendor.id },
          select: { quantity: true, unitPrice: true, variant: { select: { product: { select: { title: true } } } } },
        },
        invoices: { where: { vendorId: vendor.id }, select: { id: true } },
      },
    })
    .catch(() => null);
  if (!order) return { success: false, error: "Not found" };
  if (order.items.length === 0) return { success: false, error: "You have no items in this order" };
  if (!INVOICEABLE.includes(order.status)) return { success: false, error: "The order is not confirmed yet" };
  if (order.invoices.length > 0) return { success: false, error: "You have already invoiced this order" };

  const lines = order.items.map((it) => {
    const unitPrice = Number(it.unitPrice);
    return {
      description: it.variant.product.title,
      quantity: it.quantity,
      unitPrice,
      lineTotal: Math.round(unitPrice * it.quantity * 100) / 100,
    };
  });
  // Retail prices are VAT-inclusive → back-compute.
  const gross = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  const vatRate = 0.05;
  const net = Math.round((gross / (1 + vatRate)) * 100) / 100;
  const vatAmount = Math.round((gross - net) * 100) / 100;
  const total = gross;
  const customerName = order.address.fullName;

  const prefix = vendor.storeSlug.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "INV";
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  for (let attempt = 0; attempt < 2; attempt++) {
    const count = await prisma.orderInvoice
      .count({ where: { vendorId: vendor.id, issuedAt: { gte: yearStart, lt: yearEnd } } })
      .catch(() => 0);
    const invoiceNumber = `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;

    const result = await getEInvoiceGateway().issue({
      invoiceNumber,
      seller: { name: vendor.storeName, trn: vendor.trn },
      buyer: { name: customerName },
      subtotal: net, vatRate, vatAmount, total,
      lines,
    });
    if (result.status === "failed") return { success: false, error: result.error };

    try {
      const inv = await prisma.orderInvoice.create({
        data: {
          invoiceNumber,
          orderId,
          vendorId: vendor.id,
          vendorName: vendor.storeName,
          vendorTRN: vendor.trn,
          customerName,
          subtotal: net, vatRate, vatAmount, total,
          lines,
          externalRef: result.externalRef,
        },
        select: { id: true },
      });
      revalidatePath("/invoices");
      revalidatePath(`/orders/${orderId}`);
      return { success: true, id: inv.id };
    } catch (err) {
      const pErr = err as { code?: string; meta?: { target?: string[] } };
      const target = pErr.meta?.target ?? [];
      // (orderId, vendorId) unique → already invoiced; invoiceNumber unique → recompute once.
      if (pErr.code === "P2002" && (target.includes("orderId") || target.includes("vendorId"))) {
        return { success: false, error: "You have already invoiced this order" };
      }
      if (pErr.code === "P2002" && attempt === 0) continue;
      return { success: false, error: "Failed to issue invoice" };
    }
  }
  return { success: false, error: "Failed to issue invoice" };
}
```

- [ ] **Step 2: Type-check**
```bash
pnpm --filter @e-luna/vendor exec tsc --noEmit
```
Expected: no errors. (Needs `@e-luna/einvoice` in the vendor app deps — added in the next task's dep step, so if this errors on the import, run Task 5 Step 0 first. To be safe, add the dep now: see note.)

**Note:** add `"@e-luna/einvoice": "workspace:*"` to `apps/vendor/package.json` dependencies and
`"@e-luna/einvoice"` to `apps/vendor/next.config.ts` `transpilePackages`, then `pnpm install`, before this
type-check.

- [ ] **Step 3: Commit**
```bash
git add apps/vendor/app/actions/invoice.ts apps/vendor/package.json apps/vendor/next.config.ts pnpm-lock.yaml
git commit -m "feat(vendor): setVendorTrn + issueOrderInvoice (inclusive 5% VAT, per-vendor-per-order)"
```

---

### Task 5: Vendor invoices UI (list + printable + island)

**Files:** Create `apps/vendor/app/(dashboard)/components/IssueInvoiceButton.tsx`, `(dashboard)/invoices/page.tsx`, `(dashboard)/invoices/[id]/page.tsx`

- [ ] **Step 1: `components/IssueInvoiceButton.tsx`**
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueOrderInvoice } from "../../actions/invoice";

export function IssueInvoiceButton({ orderId, hasTrn }: { orderId: string; hasTrn: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleIssue() {
    setError(null);
    startTransition(async () => {
      const result = await issueOrderInvoice(orderId);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.push(`/invoices/${result.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={handleIssue} disabled={isPending || !hasTrn}
        className="rounded-full bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50">
        {isPending ? "Issuing…" : "Issue tax invoice"}
      </button>
      {!hasTrn && <p className="text-body-xs text-mist">Set your TRN in Settings to issue invoices.</p>}
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: `invoices/page.tsx`**
```tsx
import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";

export const metadata: Metadata = { title: "Invoices — Luna Vendor" };

export default async function InvoicesPage() {
  const user = await safeCurrentUser();
  if (!user) return null;
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null;

  const invoices = await prisma.orderInvoice
    .findMany({ where: { vendorId: vendor.id }, orderBy: { issuedAt: "desc" } })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Invoices</h2>
      {invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-ivory py-16 text-center">
          <p className="text-body-md text-ink">No invoices yet</p>
          <p className="text-body-sm text-mist mt-1">Issue a tax invoice from a confirmed order.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {invoices.map((inv) => (
            <Link key={inv.id} href={`/invoices/${inv.id}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-sand bg-ivory p-5 hover:border-ink transition-colors">
              <div className="min-w-0">
                <p className="text-body-md font-medium text-ink">{inv.invoiceNumber}</p>
                <p className="text-body-xs text-mist">
                  {inv.customerName} · {inv.issuedAt.toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <p className="text-body-sm text-ink">
                AED {Number(inv.total).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                <span className="text-mist"> incl. VAT</span>
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `invoices/[id]/page.tsx`** (uses the shared component)
```tsx
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { TaxInvoiceDocument } from "@e-luna/ui";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";

export const metadata: Metadata = { title: "Tax Invoice — Luna Vendor" };

type Props = { params: Promise<{ id: string }> };
type Line = { description: string; quantity: number; unitPrice: number; lineTotal: number };

export default async function VendorInvoicePage({ params }: Props) {
  const { id } = await params;
  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const inv = await prisma.orderInvoice.findUnique({ where: { id } }).catch(() => null);
  if (!inv || inv.vendorId !== vendor.id) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/invoices" className="text-body-sm text-mist hover:text-ink print:hidden">← Back to invoices</Link>
      <TaxInvoiceDocument
        invoiceNumber={inv.invoiceNumber}
        issuedAt={inv.issuedAt.toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" })}
        seller={{ name: inv.vendorName, trn: inv.vendorTRN }}
        buyer={{ name: inv.customerName }}
        lines={(inv.lines as Line[]) ?? []}
        subtotal={Number(inv.subtotal)}
        vatAmount={Number(inv.vatAmount)}
        total={Number(inv.total)}
        externalRef={inv.externalRef}
      />
    </div>
  );
}
```

- [ ] **Step 4: Type-check + lint**
```bash
pnpm --filter @e-luna/vendor exec tsc --noEmit && pnpm --filter @e-luna/vendor lint
```
Expected: clean.

- [ ] **Step 5: Commit**
```bash
git add "apps/vendor/app/(dashboard)/invoices" "apps/vendor/app/(dashboard)/components/IssueInvoiceButton.tsx"
git commit -m "feat(vendor): invoices list + printable invoice page"
```

---

### Task 6: Vendor order detail + Settings TRN + nav

**Files:** Modify `apps/vendor/app/(dashboard)/orders/[id]/page.tsx`, `(dashboard)/settings/page.tsx`, `(dashboard)/components/Sidebar.tsx`; create `(dashboard)/settings/components/TrnForm.tsx`

- [ ] **Step 1: `settings/components/TrnForm.tsx`**
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setVendorTrn } from "../../../actions/invoice";

export function TrnForm({ initialTrn }: { initialTrn: string | null }) {
  const router = useRouter();
  const [trn, setTrn] = useState(initialTrn ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null); setSaved(false);
    startTransition(async () => {
      const result = await setVendorTrn(trn);
      if (!result.success) { setError(result.error ?? "Something went wrong"); return; }
      setSaved(true); router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <input value={trn} inputMode="numeric" placeholder="15-digit TRN"
        onChange={(e) => setTrn(e.target.value.replace(/[^0-9]/g, "").slice(0, 15))}
        className="w-full max-w-xs rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink font-mono focus:border-gold focus:outline-none" />
      {error && <p className="text-body-sm text-coral">{error}</p>}
      {saved && <p className="text-body-sm text-sage">Saved ✓</p>}
      <button type="button" onClick={handleSave} disabled={isPending || trn.length !== 15}
        className="rounded-full bg-ink px-5 py-2 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50">
        {isPending ? "Saving…" : "Save TRN"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Settings page — add the Tax section.** In `apps/vendor/app/(dashboard)/settings/page.tsx`,
add the import + a section. Add near the other imports:
```tsx
import { prisma } from "@e-luna/db";
import { TrnForm } from "./components/TrnForm";
```
After the `getVendorByUserId` guard (before the `return`), add:
```tsx
  const record = await prisma.vendor.findUnique({ where: { id: vendor.id }, select: { trn: true } }).catch(() => null);
  const ftaConfigured = !!process.env.FTA_ACCESS_POINT_URL && !!process.env.FTA_API_KEY;
```
Inside the returned `<div className="max-w-xl space-y-10">`, add a new `<section>` (e.g. before the closing
`</div>`):
```tsx
      <section className="space-y-4">
        <div className="border-b border-sand pb-2">
          <h3 className="text-body-md font-medium text-ink">Tax &amp; E-invoicing</h3>
          <p className="text-body-sm text-mist">Your TRN appears on every tax invoice you issue to customers.</p>
        </div>
        <TrnForm initialTrn={record?.trn ?? null} />
        <p className="text-body-xs text-mist">
          E-invoicing status: {ftaConfigured ? "Connected (FTA)" : "Simulated (local)"}.
        </p>
      </section>
```

- [ ] **Step 3: Order detail — issue/view control.** In `apps/vendor/app/(dashboard)/orders/[id]/page.tsx`:
add the import `import { IssueInvoiceButton } from "../../components/IssueInvoiceButton";`. After the vendor
+ order are resolved (and the order is confirmed the order belongs to this vendor), fetch:
```tsx
  const invoice = await prisma.orderInvoice
    .findUnique({ where: { orderId_vendorId: { orderId: order.id, vendorId: vendor.id } }, select: { id: true } })
    .catch(() => null);
  const trnRow = await prisma.vendor.findUnique({ where: { id: vendor.id }, select: { trn: true } }).catch(() => null);
  const canInvoice = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status);
```
Render (place near the order actions / summary):
```tsx
      {invoice ? (
        <Link href={`/invoices/${invoice.id}`} className="inline-flex rounded-full border border-sand px-5 py-2.5 text-body-sm text-ink hover:border-ink transition-colors">
          View tax invoice →
        </Link>
      ) : canInvoice ? (
        <IssueInvoiceButton orderId={order.id} hasTrn={!!trnRow?.trn} />
      ) : null}
```
(If `Link` or `prisma` isn't imported in that file yet, add them. The `order.status`/`order.id`/`vendor.id`
are already in scope from the existing page.)

- [ ] **Step 4: Sidebar nav.** In `apps/vendor/app/(dashboard)/components/Sidebar.tsx` `NAV_ITEMS`, add after
the `Payouts` entry:
```tsx
  { icon: "🧾", label: "Invoices", href: "/invoices" },
```

- [ ] **Step 5: Type-check + lint**
```bash
pnpm --filter @e-luna/vendor exec tsc --noEmit && pnpm --filter @e-luna/vendor lint
```
Expected: clean.

- [ ] **Step 6: Commit**
```bash
git add "apps/vendor/app/(dashboard)/orders/[id]/page.tsx" "apps/vendor/app/(dashboard)/settings" "apps/vendor/app/(dashboard)/components/Sidebar.tsx"
git commit -m "feat(vendor): issue/view invoice on order detail + TRN in Settings + nav"
```

---

### Task 7: Customer — download invoice

**Files:** Modify `apps/customer/app/orders/[id]/page.tsx`; create `apps/customer/app/orders/[id]/invoice/[invoiceId]/page.tsx`

- [ ] **Step 1: Order detail — per-vendor download links.** In `apps/customer/app/orders/[id]/page.tsx`,
after the order is loaded (ownership already checked in that page), fetch the order's invoices:
```tsx
  const invoices = await prisma.orderInvoice
    .findMany({ where: { orderId: order.id }, select: { id: true, vendorName: true, invoiceNumber: true } })
    .catch(() => []);
```
And render a section (near the order items / summary):
```tsx
      {invoices.length > 0 && (
        <section className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-label text-mist mb-2">TAX INVOICES</p>
          <ul className="space-y-1">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <Link href={`/orders/${order.id}/invoice/${inv.id}`} className="text-body-sm text-gold hover:underline">
                  Download tax invoice — {inv.vendorName} ({inv.invoiceNumber})
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
```
(`Link` and `prisma` are already imported in this page.)

- [ ] **Step 2: `orders/[id]/invoice/[invoiceId]/page.tsx`** (printable, ownership double-checked)
```tsx
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { TaxInvoiceDocument } from "@e-luna/ui";
import { safeCurrentUser } from "../../../../lib/auth";

export const metadata: Metadata = { title: "Tax Invoice — Luna" };

type Props = { params: Promise<{ id: string; invoiceId: string }> };
type Line = { description: string; quantity: number; unitPrice: number; lineTotal: number };

export default async function CustomerInvoicePage({ params }: Props) {
  const { id, invoiceId } = await params;
  const user = await safeCurrentUser();
  if (!user) redirect("/sign-in");

  const profile = await prisma.customerProfile
    .findUnique({ where: { userId: user.id }, select: { id: true } })
    .catch(() => null);
  if (!profile) notFound();

  const inv = await prisma.orderInvoice
    .findUnique({ where: { id: invoiceId }, include: { order: { select: { id: true, customerId: true } } } })
    .catch(() => null);
  // The invoice must belong to this order AND this customer's order.
  if (!inv || inv.orderId !== id || inv.order.customerId !== profile.id) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-6 space-y-6">
      <Link href={`/orders/${id}`} className="text-body-sm text-mist hover:text-ink print:hidden">← Back to order</Link>
      <TaxInvoiceDocument
        invoiceNumber={inv.invoiceNumber}
        issuedAt={inv.issuedAt.toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" })}
        seller={{ name: inv.vendorName, trn: inv.vendorTRN }}
        buyer={{ name: inv.customerName }}
        lines={(inv.lines as Line[]) ?? []}
        subtotal={Number(inv.subtotal)}
        vatAmount={Number(inv.vatAmount)}
        total={Number(inv.total)}
        externalRef={inv.externalRef}
      />
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint**
```bash
pnpm --filter @e-luna/customer exec tsc --noEmit && pnpm --filter @e-luna/customer lint
```
Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add "apps/customer/app/orders/[id]/page.tsx" "apps/customer/app/orders/[id]/invoice"
git commit -m "feat(customer): download per-vendor tax invoices from the order"
```

---

### Task 8: Full-workspace verification

- [ ] **Step 1: Regenerate + full type-check**
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter "@e-luna/*" exec tsc --noEmit
```
Expected: no type errors across all packages/apps (incl. `@e-luna/einvoice`, the repointed supplier).

- [ ] **Step 2: Full lint**
```bash
pnpm lint
```
Expected: all apps clean (pre-existing customer `<img>` warnings acceptable).

- [ ] **Step 3: Commit any generated drift (only if present)**
```bash
git add -A && git commit -m "chore: sync generated artifacts for vendor invoicing" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Extract `@e-luna/einvoice` (generalized seller/buyer) + repoint supplier + delete supplier lib → Task 1. ✅
- Shared `TaxInvoiceDocument` in `@e-luna/ui` → Task 2. ✅
- `Vendor.trn` + `OrderInvoice` (`@@unique([orderId, vendorId])`) + back-relations → Task 3. ✅
- `setVendorTrn` (15-digit) + `issueOrderInvoice` (vendor-scoped; owner-has-items + order-state + TRN +
  one-per-(order,vendor); **inclusive VAT** `net=gross/1.05`; sequential numbering; P2002 retry distinguishing
  the two constraints) → Task 4. ✅
- Vendor invoices list + printable page (uses shared component) + issue island → Task 5. ✅
- Vendor order-detail issue/view + TRN in Settings + nav → Task 6. ✅
- Customer per-vendor download links + printable invoice page (order+customer ownership double-check) → Task 7. ✅
- Verification (supplier still compiles post-extraction) → Task 8. ✅

**Placeholder scan:** No TBD/TODO except the intentional `TODO(operator)` in `fta.ts`.

**Type consistency:** shared `IssueParams`/`InvoiceLine` (Task 1) consumed by the supplier repoint (Task 1)
and `issueOrderInvoice` (Task 4). `TaxInvoiceProps` (Task 2) consumed by the vendor invoice page (Task 5)
and customer invoice page (Task 7) with matching fields. `OrderInvoice`/`prisma.orderInvoice`/`Vendor.trn`
/`Order.invoices` (Task 3) used across Tasks 4–7. `setVendorTrn`/`issueOrderInvoice` (Task 4) imported by
`TrnForm` (Task 6) and `IssueInvoiceButton` (Task 5/6). VAT/Decimal handled with `Number()`/rounding.

**Scope:** one cohesive feature (vendor invoicing) plus the shared extraction it depends on; a single plan is
appropriate.
