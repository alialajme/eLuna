# Supplier Trade-Licence Verification

Suppliers can verify their UAE trade licence from **Settings → Trade licence** in
the supplier app (`supply.luna.ae`). Verification is **credential-gated**, following
the same honesty boundary as Payments, Couriers and E-invoicing:

| Environment | Behaviour |
|-------------|-----------|
| No registry keys (default) | **Simulated** local verifier — checks the licence-number *shape* and grants a one-year synthetic expiry. Nothing leaves the server. |
| Registry keys set | The `RegistryTradeLicenseVerifier` scaffold runs against the configured registry. Until an operator implements the call, submissions stay **PENDING** (never falsely VERIFIED/REJECTED). |

The verifier factory (`apps/supplier/app/lib/trade-license/factory.ts`) never throws:
absent credentials it returns the `SimulatedTradeLicenseVerifier`.

## Data

Stored on `Supplier`:

- `tradeLicenseNumber` — the submitted licence number
- `tradeLicenseStatus` — `UNVERIFIED | PENDING | VERIFIED | REJECTED`
- `tradeLicenseExpiry` — licence expiry (from the registry, or synthetic in Simulated)
- `tradeLicenseVerifiedAt` — timestamp of the last successful verification
- `tradeLicenseRef` — registry lookup / reference id

Admins see the licence status on **Supplier Approvals** to factor it into KYC.

## Going live (operator)

1. Obtain access to a UAE trade-licence registry:
   - **Basher** (unified economic register) / **DED** (Dubai Economy) APIs, or a
     free-zone authority API, or the **Ministry of Economy** national register.
2. Set the environment variables (see `.env.example`):

   ```
   TRADE_LICENSE_REGISTRY_URL=<registry endpoint>
   TRADE_LICENSE_API_KEY=<api key>
   ```

3. Implement the `TODO(operator)` in
   `apps/supplier/app/lib/trade-license/registry.ts`:
   - Call the registry with the licence number (and match the company name).
   - Map the response to `verified` (with expiry + reference), `pending`
     (async confirmation), or `rejected` (with a reason).

No schema or UI change is needed to go live — only the registry call.
