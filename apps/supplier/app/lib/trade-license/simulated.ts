import type { TradeLicenseVerifier, VerifyParams, VerifyResult } from "./gateway";

// UAE trade-licence numbers vary by issuer (DED, free zones): letters, digits,
// dashes and slashes, typically 5–20 chars. We accept that shape.
const LICENSE_SHAPE = /^[A-Za-z0-9][A-Za-z0-9\-/]{3,29}$/;

// The no-keys default. Verifies the licence-number *shape* locally and grants a
// one-year synthetic expiry — no registry network call, never throws. Real
// registry confirmation requires configuring a verifier (see config.ts).
export class SimulatedTradeLicenseVerifier implements TradeLicenseVerifier {
  async verify(params: VerifyParams): Promise<VerifyResult> {
    const num = params.licenseNumber.trim();
    if (!LICENSE_SHAPE.test(num)) {
      return { status: "rejected", reason: "Licence number format looks invalid" };
    }
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    return { status: "verified", expiry, externalRef: null };
  }
}
