import type { TradeLicenseVerifier, VerifyParams, VerifyResult } from "./gateway";

// Representative scaffold for a real UAE trade-licence registry lookup
// (Basher / DED / Ministry of Economy). Author-complete but credential-gated —
// see docs/deployment/trade-license.md.
export class RegistryTradeLicenseVerifier implements TradeLicenseVerifier {
  async verify(_params: VerifyParams): Promise<VerifyResult> {
    const url = process.env.TRADE_LICENSE_REGISTRY_URL;
    const key = process.env.TRADE_LICENSE_API_KEY;
    // Should be unreachable (factory gates on hasTradeLicenseRegistry), but stay honest.
    if (!url || !key) return { status: "pending", externalRef: null };

    // TODO(operator): call the registry with `_params.licenseNumber` (+ company
    // name match), map the response to verified/pending/rejected, and return the
    // registry lookup id as `externalRef`. Until implemented we leave the
    // submission PENDING rather than falsely verifying or rejecting.
    return { status: "pending", externalRef: null };
  }
}
