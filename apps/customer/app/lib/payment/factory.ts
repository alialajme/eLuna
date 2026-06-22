import { SimulatedGateway } from "./simulated";
import { TabbyGateway } from "./tabby";
import { TamaraGateway } from "./tamara";
import type { PaymentGateway } from "./gateway";

export function getGateway(method: string): PaymentGateway {
  switch (method) {
    case "TABBY":
      return new TabbyGateway();
    case "TAMARA":
      return new TamaraGateway();
    case "CARD":
    case "LUNA_WALLET":
    case "CASH_ON_DELIVERY":
    default:
      return new SimulatedGateway();
  }
}
