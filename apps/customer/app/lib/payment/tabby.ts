import type { PaymentGateway, ChargeParams, ChargeResult, RefundParams, RefundResult } from "./gateway";

// Integration point: replace this stub with the real Tabby SDK
// Docs: https://docs.tabby.ai/
// Required env vars: TABBY_API_KEY, TABBY_MERCHANT_CODE
export class TabbyGateway implements PaymentGateway {
  async charge(params: ChargeParams): Promise<ChargeResult> {
    console.warn("[TabbyGateway] Stub — returning simulated success. Wire real SDK to go live.");
    return {
      success: true,
      externalRef: `tabby_stub_${params.orderId}_${Date.now()}`,
    };
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    console.warn("[TabbyGateway] Stub refund — wire real SDK to go live.");
    return { success: true };
  }
}
