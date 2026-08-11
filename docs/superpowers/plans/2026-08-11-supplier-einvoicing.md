# Supplier E-Invoicing / VAT (UAE FTA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a supplier issue a UAE-tax-compliant invoice (5% VAT on net) for a fulfilled `MaterialOrder`, with a `SimulatedEInvoice` issuer that works fully offline (numbering, VAT, printable document) and a config-gated FTA/Peppol Access Point scaffold for real transmission.

**Architecture:** New `MaterialInvoice` model + `Supplier.trn`. An `EInvoiceGateway` (interface → `SimulatedEInvoice` default → `FtaEInvoice` scaffold → factory) in `apps/supplier/app/lib/einvoice/`, structurally identical to `apps/vendor/app/lib/courier/`. Supplier-scoped actions issue invoices; supplier UI adds Settings (TRN), Invoices list, a printable invoice page, and an order-detail issue control.

**Tech Stack:** Next.js 15 App Router, Prisma + PostgreSQL (`prisma db push`, NO migration files), Clerk, Tailwind (Warm Oud). Spec: `docs/superpowers/specs/2026-08-11-supplier-einvoicing-design.md`.

---

## Repo Conventions (read before starting)

- **No automated test suite.** Each task's "test" step = `db:generate` (when schema changed) + `tsc --noEmit`
  + `next lint` on the touched app. That is the quality gate.
- Prisma: edit `packages/db/prisma/schema.prisma`, then `pnpm --filter @e-luna/db db:generate` +
  `pnpm --filter @e-luna/db db:push` (local Postgres at `localhost:5432`, db `eluna`, role `postgres`/`password`).
- Server actions return `{ success: boolean; error?: string }` (create also `id`). Scoping ids are
  server-resolved from the Clerk session, never client params. DB reads `.catch(() => fallback)`.
- Money is Prisma `Decimal`; pass JS `number` into writes, `Number(...)` out. VAT rule = **net**:
  `subtotal = order.total`, `vatAmount = round(subtotal*0.05, 2)`, `total = subtotal + vatAmount`.
- The gateway pattern mirrors `apps/vendor/app/lib/courier/` (interface + Simulated default + config-gated
  scaffold + factory that never throws).

---

## File Structure

- `packages/db/prisma/schema.prisma` (modify) — `Supplier.trn`, `InvoiceStatus`, `MaterialInvoice` + back-relations.
- `apps/supplier/app/lib/einvoice/{gateway,simulated,fta,config,factory}.ts` (create).
- `apps/supplier/app/actions/invoice.ts` (create) — `setSupplierTrn`, `issueMaterialInvoice`.
- `apps/supplier/app/(dashboard)/settings/page.tsx` + `components/TrnForm.tsx` (create).
- `apps/supplier/app/(dashboard)/invoices/page.tsx`, `invoices/[id]/page.tsx` (create).
- `apps/supplier/app/(dashboard)/components/{IssueInvoiceButton,PrintButton}.tsx` (create).
- `apps/supplier/app/(dashboard)/orders/[id]/page.tsx` (modify) — issue / view control.
- `apps/supplier/app/(dashboard)/components/Sidebar.tsx` (modify) — Invoices + Settings nav.
- `.env.example` (modify) + `docs/deployment/einvoicing.md` (create).

---

### Task 1: Prisma — Supplier.trn + MaterialInvoice

**Files:** Modify `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add `trn` to `Supplier`** — in `model Supplier`, add after `ibanNumber String?` (or alongside the scalar fields):
```prisma
  trn           String?
```

- [ ] **Step 2: Add the enum** (after the `MaterialOrderStatus` enum block):
```prisma
enum InvoiceStatus {
  DRAFT
  ISSUED
  VOID
}
```

- [ ] **Step 3: Add the model** (after the `MaterialOrderItem` model's closing `}`):
```prisma
model MaterialInvoice {
  id              String        @id @default(cuid())
  invoiceNumber   String        @unique
  materialOrderId String        @unique
  supplierId      String
  vendorId        String
  supplierName    String
  supplierTRN     String
  vendorName      String
  status          InvoiceStatus @default(ISSUED)
  subtotal        Decimal       @db.Decimal(10, 2)
  vatRate         Decimal       @default(0.05) @db.Decimal(4, 2)
  vatAmount       Decimal       @db.Decimal(10, 2)
  total           Decimal       @db.Decimal(10, 2)
  lines           Json
  externalRef     String?
  issuedAt        DateTime      @default(now())
  createdAt       DateTime      @default(now())

  order    MaterialOrder @relation(fields: [materialOrderId], references: [id])
  supplier Supplier      @relation(fields: [supplierId], references: [id])

  @@index([supplierId])
  @@index([supplierId, issuedAt])
}
```

- [ ] **Step 4: Back-relations** — in `model MaterialOrder` add (alongside `items MaterialOrderItem[]`):
```prisma
  invoice MaterialInvoice?
```
In `model Supplier` add (alongside `materialOrders MaterialOrder[]`):
```prisma
  invoices MaterialInvoice[]
```

- [ ] **Step 5: Generate + push**
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter @e-luna/db db:push
```
Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 6: Commit**
```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add Supplier.trn, InvoiceStatus, MaterialInvoice"
```

---

### Task 2: E-invoice gateway (lib)

**Files:** Create `apps/supplier/app/lib/einvoice/{gateway,simulated,fta,config,factory}.ts`

- [ ] **Step 1: `gateway.ts`**
```ts
export type InvoiceLine = {
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type IssueParams = {
  invoiceNumber: string;
  supplier: { name: string; trn: string };
  vendor: { name: string };
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

- [ ] **Step 2: `simulated.ts`**
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

- [ ] **Step 3: `config.ts`**
```ts
export const hasFtaAccessPoint = () =>
  !!process.env.FTA_ACCESS_POINT_URL && !!process.env.FTA_API_KEY;
```

- [ ] **Step 4: `fta.ts`** (config-gated scaffold)
```ts
import type { EInvoiceGateway, IssueParams, IssueResult } from "./gateway";

// Representative scaffold for a real UAE FTA / Peppol Access Point.
// Author-complete but credential-gated — implement against a live Access Point.
// See docs/deployment/einvoicing.md.
export class FtaEInvoice implements EInvoiceGateway {
  async issue(params: IssueParams): Promise<IssueResult> {
    const url = process.env.FTA_ACCESS_POINT_URL;
    const key = process.env.FTA_API_KEY;
    if (!url || !key) return { status: "failed", error: "FTA Access Point not configured" };

    // TODO(operator): map `params` to a Peppol UBL 2.1 Tax Invoice, POST to the Access Point
    // with auth, and return the clearance / transmission id as `externalRef`.
    //   const res = await fetch(`${url}/invoices`, {
    //     method: "POST",
    //     headers: { authorization: `Bearer ${key}`, "content-type": "application/xml" },
    //     body: buildUblXml(params),
    //   });
    //   if (!res.ok) return { status: "failed", error: `FTA ${res.status}` };
    //   const { clearanceId } = await res.json();
    //   return { status: "issued", externalRef: clearanceId };
    return { status: "failed", error: "FtaEInvoice not implemented" };
  }
}
```

- [ ] **Step 5: `factory.ts`**
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

- [ ] **Step 6: Type-check**
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**
```bash
git add apps/supplier/app/lib/einvoice
git commit -m "feat(supplier): e-invoice gateway (Simulated default + FTA scaffold)"
```

---

### Task 3: Invoice actions

**Files:** Create `apps/supplier/app/actions/invoice.ts`

- [ ] **Step 1: Write the actions**
```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getEInvoiceGateway } from "../lib/einvoice/factory";

type ActiveSupplier = {
  id: string;
  companyName: string;
  companySlug: string;
  trn: string | null;
};

async function resolveActiveSupplier(): Promise<{ supplier: ActiveSupplier } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supplier = await prisma.supplier
    .findUnique({
      where: { userId: user.id },
      select: { id: true, companyName: true, companySlug: true, status: true, trn: true },
    })
    .catch(() => null);
  if (!supplier) return { error: "Not a supplier" };
  if (supplier.status !== "ACTIVE") return { error: "Your supplier account is not active" };
  return { supplier: { id: supplier.id, companyName: supplier.companyName, companySlug: supplier.companySlug, trn: supplier.trn } };
}

export async function setSupplierTrn(trn: string): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };
  const clean = trn.trim();
  if (!/^\d{15}$/.test(clean)) return { success: false, error: "TRN must be 15 digits" };
  try {
    await prisma.supplier.update({ where: { id: auth.supplier.id }, data: { trn: clean } });
    revalidatePath("/settings");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to save TRN" };
  }
}

const INVOICEABLE = ["ACCEPTED", "SHIPPED", "COMPLETED"];

export async function issueMaterialInvoice(
  orderId: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };
  const supplier = auth.supplier;
  if (!supplier.trn) return { success: false, error: "Set your TRN in Settings before issuing invoices" };

  const order = await prisma.materialOrder
    .findUnique({
      where: { id: orderId },
      include: { items: true, vendor: { select: { storeName: true } }, invoice: { select: { id: true } } },
    })
    .catch(() => null);
  if (!order || order.supplierId !== supplier.id) return { success: false, error: "Not found" };
  if (!INVOICEABLE.includes(order.status)) {
    return { success: false, error: "The order must be accepted before you can invoice it" };
  }
  if (order.invoice) return { success: false, error: "This order already has an invoice" };

  const subtotal = Number(order.total);
  const vatRate = 0.05;
  const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;
  const lines = order.items.map((it) => ({
    name: it.materialName,
    unit: it.unit,
    unitPrice: Number(it.unitPrice),
    quantity: it.quantity,
    lineTotal: Math.round(Number(it.unitPrice) * it.quantity * 100) / 100,
  }));

  const prefix = supplier.companySlug.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "INV";
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // Two attempts: recompute the sequential number on an invoiceNumber race (P2002).
  for (let attempt = 0; attempt < 2; attempt++) {
    const count = await prisma.materialInvoice
      .count({ where: { supplierId: supplier.id, issuedAt: { gte: yearStart, lt: yearEnd } } })
      .catch(() => 0);
    const invoiceNumber = `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;

    const result = await getEInvoiceGateway().issue({
      invoiceNumber,
      supplier: { name: supplier.companyName, trn: supplier.trn },
      vendor: { name: order.vendor.storeName },
      subtotal, vatRate, vatAmount, total, lines,
    });
    if (result.status === "failed") return { success: false, error: result.error };

    try {
      const inv = await prisma.materialInvoice.create({
        data: {
          invoiceNumber,
          materialOrderId: order.id,
          supplierId: supplier.id,
          vendorId: order.vendorId,
          supplierName: supplier.companyName,
          supplierTRN: supplier.trn,
          vendorName: order.vendor.storeName,
          subtotal, vatRate, vatAmount, total,
          lines,
          externalRef: result.externalRef,
        },
        select: { id: true },
      });
      revalidatePath("/invoices");
      revalidatePath(`/orders/${orderId}`);
      return { success: true, id: inv.id };
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
      // materialOrderId unique → already invoiced (lost a race); invoiceNumber unique → retry number.
      if (code === "P2002" && attempt === 0) continue;
      return { success: false, error: "Failed to issue invoice" };
    }
  }
  return { success: false, error: "Failed to issue invoice" };
}
```

- [ ] **Step 2: Type-check**
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit
```
Expected: no errors. (`prisma.materialInvoice`, `order.invoice`, `supplier.trn` exist after Task 1.)

- [ ] **Step 3: Commit**
```bash
git add apps/supplier/app/actions/invoice.ts
git commit -m "feat(supplier): setSupplierTrn + issueMaterialInvoice actions (5% VAT, sequential numbering)"
```

---

### Task 4: Settings page (TRN)

**Files:** Create `apps/supplier/app/(dashboard)/settings/page.tsx`, `apps/supplier/app/(dashboard)/components/TrnForm.tsx`

- [ ] **Step 1: `components/TrnForm.tsx`**
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSupplierTrn } from "../../actions/invoice";

export function TrnForm({ initialTrn }: { initialTrn: string | null }) {
  const router = useRouter();
  const [trn, setTrn] = useState(initialTrn ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setSupplierTrn(trn);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="trn" className="text-label text-mist block mb-2">TAX REGISTRATION NUMBER (TRN)</label>
        <input
          id="trn"
          value={trn}
          onChange={(e) => setTrn(e.target.value.replace(/[^0-9]/g, "").slice(0, 15))}
          placeholder="15-digit TRN"
          inputMode="numeric"
          className="w-full max-w-xs rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink font-mono"
        />
      </div>
      {error && <p className="text-body-sm text-coral">{error}</p>}
      {saved && <p className="text-body-sm text-sage">Saved ✓</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || trn.length !== 15}
        className="rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save TRN"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: `settings/page.tsx`**
```tsx
import { Metadata } from "next";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";
import { TrnForm } from "../components/TrnForm";

export const metadata: Metadata = { title: "Settings — Luna Supplier" };

const ftaConfigured = !!process.env.FTA_ACCESS_POINT_URL && !!process.env.FTA_API_KEY;

export default async function SettingsPage() {
  const user = await safeCurrentUser();
  if (!user) return null;
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return null;

  const record = await prisma.supplier
    .findUnique({ where: { id: supplier.id }, select: { trn: true } })
    .catch(() => null);

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="font-display text-display-md text-ink">Settings</h2>

      <section className="rounded-2xl border border-sand bg-ivory p-6 space-y-4">
        <div>
          <h3 className="font-display text-display-sm text-ink">Tax &amp; E-invoicing</h3>
          <p className="text-body-sm text-mist">Your TRN appears on every tax invoice you issue.</p>
        </div>
        <TrnForm initialTrn={record?.trn ?? null} />
        <div className="border-t border-sand pt-4">
          <p className="text-label text-mist mb-1">E-INVOICING STATUS</p>
          {ftaConfigured ? (
            <span className="rounded-full bg-sage/20 px-3 py-1 text-body-sm font-medium text-sage">Connected (FTA)</span>
          ) : (
            <span className="rounded-full bg-sand px-3 py-1 text-body-sm font-medium text-mist">Simulated (local)</span>
          )}
          <p className="text-body-xs text-mist mt-2">
            Invoices are issued locally. Connect a UAE FTA / Peppol Access Point to transmit them to the tax authority.
          </p>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint**
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add "apps/supplier/app/(dashboard)/settings" "apps/supplier/app/(dashboard)/components/TrnForm.tsx"
git commit -m "feat(supplier): Settings page with TRN + e-invoicing status"
```

---

### Task 5: Invoices list + printable invoice + islands

**Files:** Create `apps/supplier/app/(dashboard)/invoices/page.tsx`, `invoices/[id]/page.tsx`, `components/IssueInvoiceButton.tsx`, `components/PrintButton.tsx`

- [ ] **Step 1: `components/IssueInvoiceButton.tsx`**
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueMaterialInvoice } from "../../actions/invoice";

export function IssueInvoiceButton({ orderId, hasTrn }: { orderId: string; hasTrn: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleIssue() {
    setError(null);
    startTransition(async () => {
      const result = await issueMaterialInvoice(orderId);
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
      <button
        type="button"
        onClick={handleIssue}
        disabled={isPending || !hasTrn}
        className="rounded-full bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
      >
        {isPending ? "Issuing…" : "Issue tax invoice"}
      </button>
      {!hasTrn && <p className="text-body-xs text-mist">Set your TRN in Settings to issue invoices.</p>}
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: `components/PrintButton.tsx`**
```tsx
"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full border border-sand px-5 py-2.5 text-body-sm text-ink hover:border-ink transition-colors print:hidden"
    >
      Print
    </button>
  );
}
```

- [ ] **Step 3: `invoices/page.tsx`**
```tsx
import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";

export const metadata: Metadata = { title: "Invoices — Luna Supplier" };

export default async function InvoicesPage() {
  const user = await safeCurrentUser();
  if (!user) return null;
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return null;

  const invoices = await prisma.materialInvoice
    .findMany({ where: { supplierId: supplier.id }, orderBy: { issuedAt: "desc" } })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Invoices</h2>

      {invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-ivory py-16 text-center">
          <p className="text-body-md text-ink">No invoices yet</p>
          <p className="text-body-sm text-mist mt-1">Issue a tax invoice from an accepted order.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {invoices.map((inv) => (
            <Link key={inv.id} href={`/invoices/${inv.id}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-sand bg-ivory p-5 hover:border-ink transition-colors">
              <div className="min-w-0">
                <p className="text-body-md font-medium text-ink">{inv.invoiceNumber}</p>
                <p className="text-body-xs text-mist">
                  {inv.vendorName} · {inv.issuedAt.toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}
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

- [ ] **Step 4: `invoices/[id]/page.tsx`** (printable, ownership-checked)
```tsx
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getSupplierByUserId } from "../../../lib/supplier";
import { PrintButton } from "../../components/PrintButton";

export const metadata: Metadata = { title: "Tax Invoice — Luna Supplier" };

type Props = { params: Promise<{ id: string }> };
type Line = { name: string; unit: string; unitPrice: number; quantity: number; lineTotal: number };

const aed = (n: number) => `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) redirect("/");

  const inv = await prisma.materialInvoice.findUnique({ where: { id } }).catch(() => null);
  if (!inv || inv.supplierId !== supplier.id) notFound();

  const lines = (inv.lines as Line[]) ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/invoices" className="text-body-sm text-mist hover:text-ink">← Back to invoices</Link>
        <PrintButton />
      </div>

      <div className="rounded-2xl border border-sand bg-white p-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-display-md text-ink">Tax Invoice</p>
            <p className="text-body-sm text-mist">{inv.invoiceNumber}</p>
          </div>
          <div className="text-right text-body-sm">
            <p className="font-display text-display-sm text-gold">✦ Luna</p>
            <p className="text-mist">{inv.issuedAt.toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-y border-sand py-4 text-body-sm">
          <div>
            <p className="text-label text-mist mb-1">FROM</p>
            <p className="text-ink font-medium">{inv.supplierName}</p>
            <p className="text-mist">TRN: {inv.supplierTRN}</p>
          </div>
          <div>
            <p className="text-label text-mist mb-1">BILL TO</p>
            <p className="text-ink font-medium">{inv.vendorName}</p>
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
                <td className="py-2 text-ink">{l.name}</td>
                <td className="py-2 text-right text-mist">{l.quantity} {l.unit.toLowerCase()}</td>
                <td className="py-2 text-right text-mist">{aed(l.unitPrice)}</td>
                <td className="py-2 text-right text-ink">{aed(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto w-56 space-y-1 text-body-sm">
          <div className="flex justify-between"><span className="text-mist">Net</span><span className="text-ink">{aed(Number(inv.subtotal))}</span></div>
          <div className="flex justify-between"><span className="text-mist">VAT (5%)</span><span className="text-ink">{aed(Number(inv.vatAmount))}</span></div>
          <div className="flex justify-between border-t border-sand pt-1 font-medium">
            <span className="text-ink">Total</span><span className="text-ink">{aed(Number(inv.total))}</span>
          </div>
        </div>

        {inv.externalRef && (
          <p className="text-body-xs text-mist">FTA / Peppol reference: {inv.externalRef}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Type-check + lint**
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: clean.

- [ ] **Step 6: Commit**
```bash
git add "apps/supplier/app/(dashboard)/invoices" "apps/supplier/app/(dashboard)/components/IssueInvoiceButton.tsx" "apps/supplier/app/(dashboard)/components/PrintButton.tsx"
git commit -m "feat(supplier): invoices list + printable tax-invoice page"
```

---

### Task 6: Order detail — issue / view invoice control

**Files:** Modify `apps/supplier/app/(dashboard)/orders/[id]/page.tsx`

- [ ] **Step 1: Import the button + fetch invoice + TRN**

Add the import near the top (after the `OrderActions` import):
```tsx
import { IssueInvoiceButton } from "../../components/IssueInvoiceButton";
```
Change the order query to include the invoice, and add a TRN lookup after the ownership check. The query's `include` becomes:
```tsx
      include: { items: true, vendor: { select: { storeName: true } }, invoice: { select: { id: true } } },
```
After `if (!order || order.supplierId !== supplier.id) notFound();`, add:
```tsx
  const trnRecord = await prisma.supplier
    .findUnique({ where: { id: supplier.id }, select: { trn: true } })
    .catch(() => null);
  const canInvoice = ["ACCEPTED", "SHIPPED", "COMPLETED"].includes(order.status);
```

- [ ] **Step 2: Render the invoice control**

Immediately before the final `<OrderActions ... />` line, add:
```tsx
      {order.invoice ? (
        <Link href={`/invoices/${order.invoice.id}`}
          className="inline-flex rounded-full border border-sand px-5 py-2.5 text-body-sm text-ink hover:border-ink transition-colors">
          View tax invoice →
        </Link>
      ) : canInvoice ? (
        <IssueInvoiceButton orderId={order.id} hasTrn={!!trnRecord?.trn} />
      ) : null}

</tsx-anchor>
```
(Place it as a sibling just above `<OrderActions orderId={order.id} status={order.status} />`; remove the
`</tsx-anchor>` marker — it only shows where the block ends.)

- [ ] **Step 3: Type-check + lint**
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: clean. (`Link` is already imported in this file.)

- [ ] **Step 4: Commit**
```bash
git add "apps/supplier/app/(dashboard)/orders/[id]/page.tsx"
git commit -m "feat(supplier): issue/view tax invoice from the order detail"
```

---

### Task 7: Sidebar nav (Invoices + Settings)

**Files:** Modify `apps/supplier/app/(dashboard)/components/Sidebar.tsx`

- [ ] **Step 1: Add nav items**

Change the `NAV_ITEMS` array from:
```tsx
const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard", href: "/" },
  { icon: "🧵", label: "Materials", href: "/materials" },
  { icon: "📋", label: "Incoming Orders", href: "/orders" },
] as const;
```
to:
```tsx
const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard", href: "/" },
  { icon: "🧵", label: "Materials", href: "/materials" },
  { icon: "📋", label: "Incoming Orders", href: "/orders" },
  { icon: "🧾", label: "Invoices", href: "/invoices" },
  { icon: "⚙️", label: "Settings", href: "/settings" },
] as const;
```

- [ ] **Step 2: Type-check + lint**
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: clean.

- [ ] **Step 3: Commit**
```bash
git add "apps/supplier/app/(dashboard)/components/Sidebar.tsx"
git commit -m "feat(supplier): add Invoices + Settings to the nav"
```

---

### Task 8: Env + operator doc

**Files:** Modify `.env.example`; Create `docs/deployment/einvoicing.md`

- [ ] **Step 1: `.env.example`** — append:
```bash
# UAE e-invoicing (FTA / Peppol Access Point) — unset → invoices are issued locally (Simulated).
# See docs/deployment/einvoicing.md.
FTA_ACCESS_POINT_URL=
FTA_API_KEY=
```

- [ ] **Step 2: `docs/deployment/einvoicing.md`**
```markdown
# E-Invoicing — Operator Activation Guide

Supplier e-invoicing is **author-complete but credential-gated**. With no FTA credentials set, every
invoice is issued by `SimulatedEInvoice`: it is numbered, VAT-computed (5% on net), persisted, and rendered
as a printable Tax Invoice — the printable page **is** the compliant document. Nothing is transmitted to the
tax authority.

## Model
`apps/supplier/app/lib/einvoice/`:
- `gateway.ts` — `EInvoiceGateway.issue(params)` → `{ issued, externalRef } | { failed, error }`.
- `factory.ts` — `getEInvoiceGateway()` returns `FtaEInvoice` when `FTA_ACCESS_POINT_URL` + `FTA_API_KEY`
  are set, else `SimulatedEInvoice`.

## Going live (FtaEInvoice is the template — `fta.ts`)
1. Implement `issue()` against a real UAE FTA / Peppol Access Point: map `params` to a Peppol UBL 2.1 Tax
   Invoice, POST with auth, return the clearance / transmission id as `externalRef`.
2. Set `FTA_ACCESS_POINT_URL` and `FTA_API_KEY` (see `.env.example`).
3. Ensure suppliers have a valid 15-digit TRN (Settings → Tax & E-invoicing).
4. Verify a live clearance: issue an invoice from an accepted order and confirm the returned `externalRef`
   appears on the invoice.

Numbering is sequential per supplier per year (`<PREFIX>-<YYYY>-<NNNN>`); the DB `@@unique(invoiceNumber)`
plus a transactional retry guarantees no gaps or duplicates. Live transmission can only be verified with a
real Access Point account.
```

- [ ] **Step 3: Commit**
```bash
git add .env.example docs/deployment/einvoicing.md
git commit -m "docs(einvoicing): FTA env vars + operator activation guide"
```

---

### Task 9: Full-workspace verification

- [ ] **Step 1: Regenerate + full type-check**
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter "@e-luna/*" exec tsc --noEmit
```
Expected: no type errors across all packages/apps.

- [ ] **Step 2: Full lint**
```bash
pnpm lint
```
Expected: all apps clean (pre-existing customer `<img>` warnings acceptable).

- [ ] **Step 3: Commit any generated drift (only if present)**
```bash
git add -A && git commit -m "chore: sync generated artifacts for supplier e-invoicing" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- `Supplier.trn` + `InvoiceStatus` + `MaterialInvoice` + back-relations → Task 1. ✅
- Gateway (interface + Simulated default + FTA scaffold + config + factory) → Task 2. ✅
- `setSupplierTrn` (15-digit) + `issueMaterialInvoice` (owner + state + TRN + one-per-order, net 5% VAT,
  sequential numbering in a P2002-retry loop, gateway issue) → Task 3. ✅
- Settings page (TRN + e-invoicing status) → Task 4. ✅
- Invoices list + printable FTA-compliant invoice + issue/print islands → Task 5. ✅
- Order detail issue/view control (TRN-gated) → Task 6. ✅
- Nav (Invoices + Settings) → Task 7. ✅
- `.env.example` FTA vars + `docs/deployment/einvoicing.md` → Task 8. ✅
- Verification → each task + Task 9. ✅
- Honesty boundary (Simulated works fully; FTA transmission = scaffold) → Tasks 2, 8. ✅

**Placeholder scan:** No TBD/TODO except the intentional `TODO(operator)` markers in the FTA scaffold
(matching the courier `aramex.ts` convention). The `</tsx-anchor>` in Task 6 is an explicit placement
marker with removal instructions, not code.

**Type consistency:** `IssueParams`/`IssueResult`/`EInvoiceGateway` (Task 2) consumed by `issueMaterialInvoice`
(Task 3) and the factory. `setSupplierTrn`/`issueMaterialInvoice` (Task 3) imported by `TrnForm` (Task 4) and
`IssueInvoiceButton` (Task 5/6). `MaterialInvoice`/`prisma.materialInvoice`/`order.invoice`/`Supplier.trn`
(Task 1) used across Tasks 3, 5, 6. `lines` stored as `Json` and read back as `Line[]` in Task 5. VAT/`Decimal`
handled with `Number(...)`/rounding consistently.

**Scope:** one cohesive integration confined to the supplier app + db + einvoice lib; a single plan is right.
