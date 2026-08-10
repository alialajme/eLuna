import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

// Integration point: Noqodi (noqodi.com) — UAE digital wallet / payment gateway.
// Required env: NOQODI_API_KEY, NOQODI_MERCHANT_ID. Hosted-redirect + webhook callbacks.
// Only instantiated by the factory when hasNoqodi() is true.
export class NoqodiGateway implements PaymentGateway {
  async createPayment(_p: CreatePaymentParams): Promise<CreatePaymentResult> {
    return { status: "failed", error: "Noqodi gateway is not yet configured" };
  }

  async refund(_p: RefundParams): Promise<RefundResult> {
    return { success: false, error: "Noqodi gateway is not yet configured" };
  }
}
