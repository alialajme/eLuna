import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

export class SimulatedGateway implements PaymentGateway {
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    await new Promise((r) => setTimeout(r, 200));
    return { status: "captured", externalRef: `sim_${params.orderId}_${Date.now()}` };
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    return { success: true };
  }
}
