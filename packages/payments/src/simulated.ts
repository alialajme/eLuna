import { simulationAllowed } from "./config";
import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

export class SimulatedGateway implements PaymentGateway {
  constructor() {
    // Deepest fail-closed layer: a simulated capture must NEVER settle real
    // money. Even a direct `new SimulatedGateway()` is forbidden in production
    // (unless the explicit non-prod/staging escape hatch is set).
    if (!simulationAllowed()) {
      throw new Error(
        "SimulatedGateway is disabled in production — it would 'capture' payments for free. " +
          "Configure a real provider, or set ALLOW_SIMULATED_PAYMENTS=true only in a non-production staging environment.",
      );
    }
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    await new Promise((r) => setTimeout(r, 200));
    return { status: "captured", externalRef: `sim_${params.orderId}_${Date.now()}` };
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    return { success: true };
  }
}
