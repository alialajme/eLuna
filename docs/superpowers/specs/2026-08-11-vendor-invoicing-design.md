# Vendor Invoicing (customer orders) Design

**Status:** Approved (brainstorming) — 2026-08-11
**Relationship:** Sibling of the Supplier E-Invoicing feature (`2026-08-11-supplier-einvoicing-design.md`). Reuses its gateway (extracted to a shared package) with two differences: **per-vendor-per-order** invoicing and **VAT-inclusive** (retail) math.

## Goal

Let a **vendor** issue a UAE tax-compliant invoice for their portion of a customer `Order`, and let the
**customer** view/download it. A customer order can contain items from multiple vendors, so each vendor
issues one invoice covering **their** line items. Retail prices are VAT-inclusive, so VAT is
back-computed from the gross. Follows the credential-gated gateway pattern (Simulated default + FTA
scaffold).

**Success criteria:** for an order that is a real sale (CONFIRMED/PROCESSING/SHIPPED/DELIVERED), a vendor
with a saved TRN can issue exactly one invoice for their items in that order; the system back-computes 5%
VAT from the gross (`net = gross/1.05`), assigns a unique sequential number, and renders a printable
FTA-compliant tax invoice; the customer can view/download each vendor's invoice from their order page. A
two-vendor order yields two independent invoices. With no FTA credentials the whole flow works via the
Simulated issuer.

## Confirmed Decisions

- **VAT = inclusive (retail):** the vendor's `gross = Σ(unitPrice × quantity)` for their items is
  VAT-inclusive; `net = round(gross / 1.05, 2)`, `vatAmount = round(gross − net, 2)`, `total = gross`.
- **Extract a shared `@e-luna/einvoice` package** (the gateway currently in `apps/supplier`), reused by
  supplier + vendor; repoint the supplier to it.
- **Vendor-issued MVP + customer-view.** Auto-issue-on-payment is deferred.

## Non-Goals (deferred)

- Auto-issuing invoices on payment/confirmation.
- Allocating order-level shipping/discount across vendor invoices (MVP invoices item lines only).
- Credit notes, multi-currency, non-5% rates.
- Real FTA/Peppol transmission (the `FtaEInvoice` scaffold is credential-gated, unchanged).

## Part A — Extract the shared `@e-luna/einvoice` package

Move `apps/supplier/app/lib/einvoice/{gateway,simulated,fta,config,factory}.ts` into a new workspace
package **`packages/einvoice`** (`@e-luna/einvoice`), and **generalize** the gateway types so both a
supplier→vendor and a vendor→customer invoice fit:

```ts
// packages/einvoice/src/gateway.ts
export type InvoiceLine = { description: string; quantity: number; unitPrice: number; lineTotal: number };
export type IssueParams = {
  invoiceNumber: string;
  seller: { name: string; trn: string };
  buyer: { name: string };
  subtotal: number; vatRate: number; vatAmount: number; total: number;
  lines: InvoiceLine[];
};
export type IssueResult = { status: "issued"; externalRef: string | null } | { status: "failed"; error: string };
export interface EInvoiceGateway { issue(params: IssueParams): Promise<IssueResult>; }
```

- `simulated.ts`, `config.ts` (`hasFtaAccessPoint`), `fta.ts` (`FtaEInvoice` scaffold), `factory.ts`
  (`getEInvoiceGateway`) move unchanged (config reads the same `FTA_ACCESS_POINT_URL`/`FTA_API_KEY`).
- `index.ts` barrel re-exports all of the above.
- **Repoint the supplier:** `apps/supplier/app/actions/invoice.ts` imports `getEInvoiceGateway` from
  `@e-luna/einvoice`; delete `apps/supplier/app/lib/einvoice/`. The supplier's `issue(...)` call maps
  `supplier`→`seller`, `vendor`→`buyer`, and its lines to `{ description: materialName, quantity,
  unitPrice, lineTotal }` (the richer material `unit` stays only in the supplier's `MaterialInvoice.lines`
  JSON, not the gateway params). Add `@e-luna/einvoice` to the supplier app's deps + `transpilePackages`.

`packages/einvoice/package.json` = `@e-luna/einvoice`, exports `./src/index.ts` (raw TS, like `@e-luna/db`);
tsconfig extends `@e-luna/config/tsconfig/base`.

## Part B — Shared printable invoice component (`@e-luna/ui`)

Add **`TaxInvoiceDocument`** to `@e-luna/ui` — a pure render component (props only, no server deps) used by
both the vendor and customer printable invoice pages:

```ts
type TaxInvoiceProps = {
  invoiceNumber: string; issuedAt: string; // formatted date
  seller: { name: string; trn: string };
  buyer: { name: string };
  lines: { description: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number; vatAmount: number; total: number; vatRate: number;
  externalRef?: string | null;
};
```
Renders the "Tax Invoice" layout (title + number, seller name+TRN, bill-to, line table, Net / VAT (5%) /
Total in AED, `externalRef` when present), `print:`-friendly. (The supplier's existing inline invoice page
may adopt this later — out of scope now.)

## Part C — Data model (Prisma, `db push`)

- **`Vendor.trn String?`** — the vendor's 15-digit TRN (set in the vendor's existing Settings; required
  before issuing).
- **New `model OrderInvoice`:**
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
  Back-relations: `invoices OrderInvoice[]` on `Order`; `orderInvoices OrderInvoice[]` on `Vendor`.
  (`InvoiceStatus` from the supplier feature is not reused — `OrderInvoice` is always issued; add a status
  enum later only if VOID/credit-notes are needed.)

## Part D — Vendor side (`apps/vendor`)

- **`actions/invoice.ts`** — `setVendorTrn(trn)` (validate `/^\d{15}$/`, active vendor) and
  `issueOrderInvoice(orderId)`:
  - Resolve the ACTIVE vendor server-side (`safeCurrentUser` → `getVendorByUserId`); require `vendor.trn`.
  - Load the order (`select` status + `address.fullName` + items **where `vendorId === vendor.id`** with
    `variant.product.title`, `quantity`, `unitPrice`) + existing `OrderInvoice` for this (order, vendor).
  - Guards: the vendor has ≥1 item in the order; `order.status ∈ {CONFIRMED, PROCESSING, SHIPPED, DELIVERED}`;
    TRN present; no existing invoice for (orderId, vendorId).
  - Lines: `{ description: product.title, quantity, unitPrice, lineTotal: round(unitPrice*qty, 2) }`.
  - **Inclusive VAT:** `gross = Σ lineTotal`; `net = round(gross/1.05, 2)`; `vat = round(gross − net, 2)`;
    `total = gross`. (`subtotal` stored = `net`.)
  - Sequential number `<STORE>-<YYYY>-<NNNN>` (prefix from `vendor.storeSlug`, alnum first-4 upper; count
    this vendor's `OrderInvoice`s in the year + 1), gateway `issue`, `create` — with the same two-attempt
    P2002 retry that distinguishes `orderId_vendorId` (→ "already invoiced") from `invoiceNumber` (→ recompute).
    `customerName` snapshot = `order.address.fullName`.
- **Order detail** `(dashboard)/orders/[id]/page.tsx` — when the order is a real sale, an
  **Issue tax invoice** control (TRN-gated island) or **View invoice** link if one exists for this vendor.
- **`(dashboard)/invoices/page.tsx`** + **`invoices/[id]/page.tsx`** — the vendor's issued invoices list +
  a printable page rendering `TaxInvoiceDocument` (ownership-checked → `notFound`). Nav "🧾 Invoices".
- **Settings** — add the TRN field (`setVendorTrn`) to the vendor's existing `(dashboard)/settings` page +
  an e-invoicing status line (Simulated/Connected), mirroring the supplier settings.

## Part E — Customer side (`apps/customer`)

- **Order detail** `orders/[id]/page.tsx` — for each `OrderInvoice` on the order, a
  **"Download tax invoice — <vendor>"** link (grouped with that vendor's items).
- **`orders/[id]/invoice/[invoiceId]/page.tsx`** — a printable invoice page: load the invoice, verify
  `invoice.orderId === order.id` **and** the order belongs to the current customer (`order.customerId ===
  currentCustomerProfile.id`), else `notFound()`. Renders `TaxInvoiceDocument`. Read-only (customers never issue).

## Data Flow

1. Vendor sets TRN in Settings.
2. Order reaches a real-sale status (CONFIRMED+).
3. Vendor opens their order detail → "Issue tax invoice" → `issueOrderInvoice` → `OrderInvoice` persisted
   (inclusive 5% VAT, sequential number) for that vendor's items.
4. Customer opens their order → "Download tax invoice — <vendor>" → printable invoice.
5. A multi-vendor order → one invoice per vendor, each vendor-issued independently.

## Error Handling

- Actions return `{ success, error? }`; vendorId server-resolved; guards: owner-has-items, order state,
  TRN present, one-per-(order,vendor). Numbering + create with the P2002-retry (distinguishing the two
  unique constraints). DB reads `.catch`-guarded; `[id]` pages `notFound()` on missing/unowned; the
  customer invoice page double-checks order ownership.

## Testing

No automated suite — types + lint + manual:
1. `pnpm install` (new `@e-luna/einvoice` package + vendor/supplier deps) + `db:generate` + `db:push`.
2. `pnpm --filter "@e-luna/*" exec tsc --noEmit` — clean (incl. the repointed supplier).
3. `pnpm lint` — clean.
4. gitleaks — clean.
5. Manual: set a vendor TRN; on a DELIVERED multi-vendor order, each vendor issues one invoice; inclusive
   VAT correct (`net = gross/1.05`); re-issue blocked; the customer downloads each vendor's invoice; a
   second customer/vendor can't access another's invoice; the **supplier** e-invoicing still works after the
   package extraction.

## File Summary

- Create: `packages/einvoice/` (`package.json`, `tsconfig.json`, `src/{gateway,simulated,fta,config,factory,index}.ts`).
- Modify: `apps/supplier/app/actions/invoice.ts` (import from `@e-luna/einvoice`, map seller/buyer); delete
  `apps/supplier/app/lib/einvoice/`; `apps/supplier/package.json` + `next.config.ts` (add `@e-luna/einvoice`).
- Create: `packages/ui/src/components/TaxInvoiceDocument.tsx` (+ export).
- Modify: `packages/db/prisma/schema.prisma` (`Vendor.trn`, `OrderInvoice` + back-relations).
- Vendor: create `actions/invoice.ts`, `(dashboard)/invoices/{page,[id]}.tsx`, an `IssueInvoiceButton`
  island; modify `(dashboard)/orders/[id]/page.tsx`, `(dashboard)/settings/page.tsx`, Sidebar (Invoices nav).
- Customer: modify `orders/[id]/page.tsx`; create `orders/[id]/invoice/[invoiceId]/page.tsx`.
- (No `.env` change — reuses `FTA_ACCESS_POINT_URL`/`FTA_API_KEY`.)
