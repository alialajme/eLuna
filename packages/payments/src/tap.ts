import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

// Integration point: Tap Payments (tap.company) — https://developers.tap.company/
// Required env: TAP_SECRET_KEY, TAP_MERCHANT_ID. Hosted-redirect charges + webhook callbacks.
// Only instantiated by the factory when hasTap() is true.
export class TapGateway implements PaymentGateway {
  async createPayment(_p: CreatePaymentParams): Promise<CreatePaymentResult> {
    return { status: "failed", error: "Tap gateway is not yet configured" };
  }

  async refund(_p: RefundParams): Promise<RefundResult> {
    return { success: false, error: "Tap gateway is not yet configured" };
  }
}
