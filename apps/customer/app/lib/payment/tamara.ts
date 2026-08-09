import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

// Integration point: replace this stub with the real Tamara SDK.
// Docs: https://docs.tamara.co/  — Required env: TAMARA_API_TOKEN, TAMARA_NOTIFICATION_TOKEN
export class TamaraGateway implements PaymentGateway {
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    console.warn("[TamaraGateway] Stub — simulated capture. Wire real SDK to go live.");
    return { status: "captured", externalRef: `tamara_stub_${params.orderId}_${Date.now()}` };
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    console.warn("[TamaraGateway] Stub refund — wire real SDK to go live.");
    return { success: true };
  }
}
