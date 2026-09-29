# ADR-0003 — Immutable financial & wallet ledgers

**Status:** Accepted

## Context
Seller balances and wallet spend were reconstructed from mutable operational rows, and there was no
append-only record of money movements. Financial history must be auditable and never rewritten.

## Decision
Introduce two append-only tables:
- `WalletTransaction` — every wallet CREDIT/DEBIT/REFUND/REVERSAL/ADJUSTMENT with `balanceAfter`
  snapshot; wallet spend goes through an atomic balance-guarded debit + ledger row.
- `LedgerEntry` — signed marketplace movements (PAYOUT, REFUND, COMMISSION, …) written in the same
  transaction as the state change.

Rows are never UPDATEd or DELETEd; corrections are new reversing/adjustment entries. FKs to
financial records use `Restrict` (never cascade-delete audit/financial history).

## Alternatives
- **Full double-entry accounting from day one:** deferred — higher modelling cost; current signed
  single-entry ledger + operational balance is a pragmatic first step.
- **Reconstruct from operational rows only:** rejected — not auditable, drifts, can't explain a
  balance historically.

## Consequences
- Vendor balance is computed by one Decimal, reserved-aware helper (`computeVendorBalance`); the
  ledger is the immutable movement trail.
- Making the ledger the *authoritative* balance (posting SALE/COMMISSION accrual at delivery) is a
  documented follow-up requiring delivery-path test coverage first.
