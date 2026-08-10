import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

// Integration point: replace this stub with the real Tabby SDK.
// Docs: https://docs.tabby.ai/  — Required env: TABBY_API_KEY, TABBY_MERCHANT_CODE
export class TabbyGateway implements PaymentGateway {
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    console.warn("[TabbyGateway] Stub — simulated capture. Wire real SDK to go live.");
    return { status: "captured", externalRef: `tabby_stub_${params.orderId}_${Date.now()}` };
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    console.warn("[TabbyGateway] Stub refund — wire real SDK to go live.");
    return { success: true };
  }
}
