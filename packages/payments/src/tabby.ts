import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

// Integration point: Tabby BNPL (tabby.ai) — https://docs.tabby.ai/
// Required env: TABBY_API_KEY, TABBY_MERCHANT_CODE. Hosted-checkout sessions + webhooks.
// Only instantiated by the factory when hasTabby() is true. Until the real SDK is
// wired this fails CLOSED: a configured-but-unimplemented provider must never fake a
// capture (that would mark an order paid in production without moving money).
export class TabbyGateway implements PaymentGateway {
  async createPayment(_p: CreatePaymentParams): Promise<CreatePaymentResult> {
    return { status: "failed", error: "Tabby gateway is not yet configured" };
  }

  async refund(_p: RefundParams): Promise<RefundResult> {
    return { success: false, error: "Tabby gateway is not yet configured" };
  }
}
