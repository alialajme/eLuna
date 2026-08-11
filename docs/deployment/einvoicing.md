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
plus a single retry-on-collision guarantees no duplicate numbers, and `@@unique(materialOrderId)` guarantees
at most one invoice per order. Note: `issue()` (the gateway/transmission call) is currently made **before**
the DB write and is **not** wrapped in a transaction — safe under `SimulatedEInvoice`, but before activating
`FtaEInvoice` move to a persist-DRAFT → transmit → mark-ISSUED flow so a failed DB write can't leave an
invoice transmitted-but-unrecorded. Live transmission can only be verified with a real Access Point account.
