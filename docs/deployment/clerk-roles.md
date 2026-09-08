# Clerk Role Sync

How a contracted vendor/supplier goes from "signed up" to "can log into their OS
with the right role." This closes the gap where the DB knew the role/status but
the Clerk session token did not.

## How roles are read at runtime

`getAuthUser()` (`packages/auth/src/server.ts`) reads the role from the **Clerk
session claims**, not the DB:

```ts
const role       = claims.metadata?.role ?? null;
const vendorId   = claims.metadata?.vendorId ?? null;
const supplierId = claims.metadata?.supplierId ?? null;
```

So a user can only act as a VENDOR/SUPPLIER once those values are present in their
Clerk token.

## How they get there (`syncClerkRole`)

`syncClerkRole(userId, { role, vendorId?, supplierId? })`
(`packages/auth/src/sync.ts`) writes those values into Clerk **`publicMetadata`**
via the Clerk backend SDK. It is wired into the moments that matter:

| When | Action | What it syncs |
|------|--------|---------------|
| Vendor completes onboarding | `createVendor` (`apps/vendor`) | `role: VENDOR`, `vendorId` |
| Supplier completes onboarding | `createSupplier` (`apps/supplier`) | `role: SUPPLIER`, `supplierId` |
| Admin **approves** a vendor | `approveVendor`/`reactivateVendor` → `setVendorStatus(ACTIVE)` | `role: VENDOR`, `vendorId` (idempotent) |
| Admin **approves** a supplier | `approveSupplier`/`reactivateSupplier` → `setSupplierStatus(ACTIVE)` | `role: SUPPLIER`, `supplierId` (idempotent) |

Suspend/reject stay DB-only — the apps gate those by the DB `status` (the user
lands on `/pending`), so the Clerk claim doesn't need revoking.

It is **credential-gated + best-effort**:

- No `CLERK_SECRET_KEY` (local/demo) → it no-ops. The demo shim reads role from the
  DB, so the demo runs without Clerk.
- A Clerk API error is logged and swallowed, never thrown. The DB is the source of
  truth for `status`; approval re-syncs idempotently, so a transient Clerk failure
  can't wedge the flow.

## Required Clerk dashboard config (operator, one-time per instance)

`publicMetadata` is not in the default session token. In the Clerk dashboard →
**Sessions → Customize session token**, add:

```json
{
  "metadata": "{{user.public_metadata}}"
}
```

This makes `sessionClaims.metadata.{role,vendorId,supplierId}` resolve — matching
what `getAuthUser()` reads. Do this for **each** app's Clerk instance
(customer / vendor / supplier / admin).

## The end-to-end flow (production)

1. Vendor signs up on `sell.luna.ae`, completes onboarding → DB: `User.role=VENDOR`,
   `Vendor.status=PENDING`; Clerk: `publicMetadata.role=VENDOR`, `vendorId`. They
   land on `/pending`.
2. Admin approves in `ops.luna.ae/sellers/approvals` → DB: `Vendor.status=ACTIVE`;
   Clerk re-synced. 
3. Vendor's next request carries `role=VENDOR` + `vendorId` in the token → they
   reach the Vendor OS and can publish products.

Suppliers follow the identical path on `supply.luna.ae` + `/suppliers/approvals`.

## Optional follow-up: `user.created` webhook

Onboarding upserts the DB `User`, so vendors/suppliers get a row without a webhook.
If you want the DB `User` created for **every** Clerk signup (e.g. customers) at the
moment of signup rather than lazily, add a Clerk `user.created` webhook
(`svix`-verified) that upserts `User { id, email }`. Not required for the
vendor/supplier role flow above.
