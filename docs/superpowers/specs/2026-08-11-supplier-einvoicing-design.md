# Supplier E-Invoicing / VAT (UAE FTA) Design

**Status:** Approved (brainstorming) — 2026-08-11
**Scope:** First of the "Supplier OS ↔ UAE systems" integrations (others deferred: ERP/inventory sync, supplier verification, customs/Dubai Trade).

## Goal

Let a Luna **supplier** issue a UAE-tax-compliant invoice for a fulfilled material order (S3
`MaterialOrder`, supplier → vendor), with 5% VAT and the supplier's TRN. It follows the project's
**credential-gated gateway** pattern (as used for Payments and Couriers): a `SimulatedEInvoice` issuer
that produces a fully-numbered, VAT-correct, FTA-field-complete invoice **locally** (the no-keys default),
plus a **config-gated FTA/Peppol Access Point scaffold** for the real government/Peppol network
transmission (the operator step).

**Success criteria:** an ACTIVE supplier with a saved TRN can, from an accepted/shipped/completed
material order, issue exactly one tax invoice; the system computes 5% VAT (net + VAT = total), assigns a
unique sequential invoice number, and renders a printable, FTA-compliant tax-invoice document; the
supplier sees all invoices under an Invoices section. With no FTA credentials the whole flow works via
the Simulated issuer; real Peppol/FTA submission is author-complete but credential-gated.

## Honesty Boundary (matches Payments/Couriers)

- **Works fully offline:** TRN capture, VAT computation, sequential numbering, invoice persistence, and
  the printable compliant document.
- **Credential-gated (operator):** transmitting the invoice to the UAE FTA / Peppol network via a real
  Access Point (returns an `externalRef` / clearance id). The `FtaEInvoice` adapter is a documented
  scaffold with `TODO(operator)` integration points — no fabricated blind API calls.

## Non-Goals (deferred)

- Real PDF/UBL-XML file generation and Peppol transmission (scaffold only).
- Credit notes, partial invoices, multi-currency, non-5% rates, reverse-charge.
- Vendor-side invoice inbox (the vendor sees the total on the order already; a formal inbox is later).
- The other UAE integrations (ERP sync, trade-licence verification, customs).

## Data Model (Prisma — `prisma db push`, NO migration files)

All in `packages/db/prisma/schema.prisma`.

1. **`Supplier.trn String?`** — the supplier's 15-digit Tax Registration Number. Set in the new
   Tax & E-invoicing settings; required before issuing an invoice.

2. **New `enum InvoiceStatus { DRAFT ISSUED VOID }`** (MVP issues directly to `ISSUED`; `DRAFT`/`VOID`
   reserved for future).

3. **New `model MaterialInvoice`:**
   ```prisma
   model MaterialInvoice {
     id             String        @id @default(cuid())
     invoiceNumber  String        @unique
     materialOrderId String       @unique
     supplierId     String
     vendorId       String
     supplierName   String        // snapshot
     supplierTRN    String        // snapshot
     vendorName     String        // snapshot (vendor storeName)
     status         InvoiceStatus @default(ISSUED)
     subtotal       Decimal       @db.Decimal(10, 2)
     vatRate        Decimal       @default(0.05) @db.Decimal(4, 2)
     vatAmount      Decimal       @db.Decimal(10, 2)
     total          Decimal       @db.Decimal(10, 2)
     lines          Json          // snapshot: [{ name, unit, unitPrice, quantity, lineTotal }]
     externalRef    String?       // FTA/Peppol clearance id when transmitted
     issuedAt       DateTime      @default(now())
     createdAt      DateTime      @default(now())

     order    MaterialOrder @relation(fields: [materialOrderId], references: [id])
     supplier Supplier      @relation(fields: [supplierId], references: [id])

     @@index([supplierId])
     @@index([supplierId, issuedAt])
   }
   ```
   Back-relations: `invoice MaterialInvoice?` on `MaterialOrder`; `invoices MaterialInvoice[]` on `Supplier`.

**VAT rule (confirmed = net):** `subtotal = MaterialOrder.total` (net); `vatAmount = round(subtotal × 0.05, 2)`;
`total = subtotal + vatAmount`. UAE standard rate 5%.

## Gateway (`apps/supplier/app/lib/einvoice/`)

Mirrors `apps/vendor/app/lib/courier/` structurally.

- **`gateway.ts`** — the interface + result unions:
  ```ts
  export type IssueParams = {
    invoiceNumber: string;
    supplier: { name: string; trn: string };
    vendor: { name: string };
    subtotal: number; vatRate: number; vatAmount: number; total: number;
    lines: { name: string; unit: string; unitPrice: number; quantity: number; lineTotal: number }[];
  };
  export type IssueResult =
    | { status: "issued"; externalRef: string | null }
    | { status: "failed"; error: string };
  export interface EInvoiceGateway { issue(params: IssueParams): Promise<IssueResult>; }
  ```
- **`simulated.ts`** — `SimulatedEInvoice`: returns `{ status: "issued", externalRef: null }` (no network;
  the printable page IS the document). The no-keys default.
- **`fta.ts`** — `FtaEInvoice` scaffold: config-gated real Access Point adapter; `TODO(operator)` markers
  for auth, UBL/Peppol mapping, submission, and clearance-id capture. Returns `issued` with a real
  `externalRef` (or `failed`) once implemented.
- **`config.ts`** — `hasFtaAccessPoint()` reading `FTA_ACCESS_POINT_URL`/`FTA_API_KEY`.
- **`factory.ts`** — `getEInvoiceGateway()` → `FtaEInvoice` if configured, else `SimulatedEInvoice`; never throws.

## Server Actions (`apps/supplier/app/actions/invoice.ts`)

Supplier-scoped (resolve supplier from Clerk session, never a client param).

- **`setSupplierTrn(trn: string)`** — validate a 15-digit TRN (`/^\d{15}$/`), owner (ACTIVE supplier),
  `prisma.supplier.update`. Returns `{ success, error? }`.
- **`issueMaterialInvoice(orderId: string)`** — resolve ACTIVE supplier; load the order
  (`include: { items: true, vendor: { select: { storeName } } }`); guards: `order.supplierId === supplier.id`,
  `order.status ∈ {ACCEPTED, SHIPPED, COMPLETED}`, `supplier.trn` present, no existing invoice for the order.
  Compute VAT (net rule). In a `prisma.$transaction`: derive the next **sequential invoice number** for the
  supplier+year (`<PREFIX>-<YYYY>-<NNNN>`, `PREFIX` from `companySlug`; count this supplier's invoices in the
  year, `+1`, zero-padded), call `getEInvoiceGateway().issue(params)` (abort on `failed`), then
  `prisma.materialInvoice.create` (snapshots + `externalRef`). `revalidatePath("/invoices")` +
  `/orders/${orderId}`. Returns `{ success, id?, error? }`. The `@@unique(invoiceNumber)` + transaction
  guarantee no gaps/dupes under concurrency (retry-on-P2002 once).

## Supplier UI (`apps/supplier/app/(dashboard)`)

- **`settings/page.tsx`** (new) — a **Tax & E-invoicing** panel: a `TrnForm` (client) to set/update the TRN,
  and a read-only **E-invoicing status** line (`Connected (FTA)` when configured, else `Simulated (local)`).
  Nav: "⚙️ Settings".
- **`orders/[id]/page.tsx`** (modify) — when `order.status ∈ {ACCEPTED, SHIPPED, COMPLETED}` and no invoice
  yet, show an **"Issue tax invoice"** control (an `IssueInvoiceButton` client island calling
  `issueMaterialInvoice`); if an invoice exists, show a **"View invoice"** link. If TRN missing, the button
  is disabled with a "Set your TRN in Settings" hint.
- **`invoices/page.tsx`** (new) — the supplier's invoices (`where: { supplierId }`, newest first): number,
  vendor, total (incl. VAT), issued date, status; link to detail. Nav: "🧾 Invoices".
- **`invoices/[id]/page.tsx`** (new) — a **printable FTA-compliant Tax Invoice**: title "Tax Invoice",
  supplier name + TRN, buyer (vendor) name, invoice number + issue date, the line items, **Net / VAT (5%) /
  Total (AED)**, and the `externalRef` (Peppol/FTA id) if present. Ownership-checked (`notFound` otherwise);
  a "Print" affordance (`window.print()` via a small client button). This page is the document for the
  Simulated issuer.

## Data Flow

1. Supplier sets TRN in Settings.
2. Supplier accepts a vendor material order (S3).
3. On the order detail, "Issue tax invoice" → `issueMaterialInvoice` → gateway issues → `MaterialInvoice`
   persisted (net + 5% VAT, sequential number).
4. Supplier views/prints the compliant invoice under Invoices; the order detail links to it.

## Error Handling

- Actions return `{ success, error? }`; guards: owner, order state, TRN present + valid, one invoice/order.
- Numbering + create inside `$transaction`; `@@unique(invoiceNumber)` + single P2002 retry prevents dupes.
- Gateway `failed` aborts before persistence. DB reads `.catch`-guarded; `[id]` pages `notFound()` on
  missing/unowned records.
- No FTA creds → Simulated issuer (always succeeds); the printable page is the invoice.

## Testing

No automated suite — types + lint + manual:
1. `pnpm --filter @e-luna/db db:generate` + `db:push` (new model/enum/field).
2. `pnpm --filter "@e-luna/*" exec tsc --noEmit` — clean.
3. `pnpm lint` — clean.
4. gitleaks — clean.
5. Manual: set TRN; from an ACCEPTED order issue an invoice → net + 5% VAT + total correct, unique number,
   printable document; re-issue blocked; issuing without TRN blocked; a second supplier can't view the
   first's invoice.

## Environment / Ops

- `.env.example`: `FTA_ACCESS_POINT_URL=`, `FTA_API_KEY=` (+ note: unset → Simulated local issuing).
- `docs/deployment/einvoicing.md`: how to implement `FtaEInvoice` against a real FTA/Peppol Access Point,
  set the env, and verify a live clearance — the operator activation guide.

## File Summary

- Modify: `packages/db/prisma/schema.prisma` (Supplier.trn, InvoiceStatus, MaterialInvoice + back-relations)
- Create: `apps/supplier/app/lib/einvoice/{gateway,simulated,fta,config,factory}.ts`
- Create: `apps/supplier/app/actions/invoice.ts` (`setSupplierTrn`, `issueMaterialInvoice`)
- Create: `apps/supplier/app/(dashboard)/settings/page.tsx` + `components/TrnForm.tsx`
- Create: `apps/supplier/app/(dashboard)/invoices/page.tsx`, `invoices/[id]/page.tsx` + a print button + `IssueInvoiceButton`
- Modify: `apps/supplier/app/(dashboard)/orders/[id]/page.tsx` (issue / view invoice)
- Modify: `apps/supplier/app/(dashboard)/components/Sidebar.tsx` (Invoices + Settings nav)
- Modify: `.env.example`; Create: `docs/deployment/einvoicing.md`
