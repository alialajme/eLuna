import type { PaymentGateway, ChargeParams, ChargeResult, RefundParams, RefundResult } from "./gateway";

export class SimulatedGateway implements PaymentGateway {
  async charge(params: ChargeParams): Promise<ChargeResult> {
    await new Promise((r) => setTimeout(r, 200));
    return {
      success: true,
      externalRef: `sim_${params.orderId}_${Date.now()}`,
    };
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    return { success: true };
  }
}
