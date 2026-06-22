import type { PaymentGateway, ChargeParams, ChargeResult, RefundParams, RefundResult } from "./gateway";

// Integration point: replace this stub with the real Tamara SDK
// Docs: https://docs.tamara.co/
// Required env vars: TAMARA_API_TOKEN, TAMARA_NOTIFICATION_TOKEN
export class TamaraGateway implements PaymentGateway {
  async charge(params: ChargeParams): Promise<ChargeResult> {
    console.warn("[TamaraGateway] Stub — returning simulated success. Wire real SDK to go live.");
    return {
      success: true,
      externalRef: `tamara_stub_${params.orderId}_${Date.now()}`,
    };
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    console.warn("[TamaraGateway] Stub refund — wire real SDK to go live.");
    return { success: true };
  }
}
