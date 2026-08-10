import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

// Integration point: NeoPay by Mashreq (neopay.ae) — UAE payment gateway.
// Required env: NEOPAY_API_KEY, NEOPAY_MERCHANT_ID. Hosted-redirect + webhook callbacks.
// Only instantiated by the factory when hasNeopay() is true.
export class NeopayGateway implements PaymentGateway {
  async createPayment(_p: CreatePaymentParams): Promise<CreatePaymentResult> {
    return { status: "failed", error: "NeoPay gateway is not yet configured" };
  }

  async refund(_p: RefundParams): Promise<RefundResult> {
    return { success: false, error: "NeoPay gateway is not yet configured" };
  }
}
