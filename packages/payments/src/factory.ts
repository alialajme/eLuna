import { SimulatedGateway } from "./simulated";
import { TabbyGateway } from "./tabby";
import { TamaraGateway } from "./tamara";
import { StripeGateway } from "./stripe";
import { TapGateway } from "./tap";
import { NoqodiGateway } from "./noqodi";
import { NeopayGateway } from "./neopay";
import { hasStripe, hasTap, hasNoqodi, hasNeopay } from "./config";
import type { PaymentGateway } from "./gateway";

export function getGateway(method: string): PaymentGateway {
  switch (method) {
    case "CARD":
      return hasStripe() ? new StripeGateway() : new SimulatedGateway();
    case "TABBY":
      return new TabbyGateway();
    case "TAMARA":
      return new TamaraGateway();
    case "TAP":
      return hasTap() ? new TapGateway() : new SimulatedGateway();
    case "NOQODI":
      return hasNoqodi() ? new NoqodiGateway() : new SimulatedGateway();
    case "NEOPAY":
      return hasNeopay() ? new NeopayGateway() : new SimulatedGateway();
    case "LUNA_WALLET":
    case "CASH_ON_DELIVERY":
    default:
      return new SimulatedGateway();
  }
}
