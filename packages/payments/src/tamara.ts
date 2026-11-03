import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

// Integration point: Tamara BNPL (tamara.co) — https://docs.tamara.co/
// Required env: TAMARA_API_TOKEN, TAMARA_NOTIFICATION_TOKEN. Hosted-checkout + webhooks.
// Only instantiated by the factory when hasTamara() is true. Until the real SDK is
// wired this fails CLOSED: a configured-but-unimplemented provider must never fake a
// capture (that would mark an order paid in production without moving money).
export class TamaraGateway implements PaymentGateway {
  async createPayment(_p: CreatePaymentParams): Promise<CreatePaymentResult> {
    return { status: "failed", error: "Tamara gateway is not yet configured" };
  }

  async refund(_p: RefundParams): Promise<RefundResult> {
    return { success: false, error: "Tamara gateway is not yet configured" };
  }
}
