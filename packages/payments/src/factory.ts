import { SimulatedGateway } from "./simulated";
import { TabbyGateway } from "./tabby";
import { TamaraGateway } from "./tamara";
import { StripeGateway } from "./stripe";
import { TapGateway } from "./tap";
import { NoqodiGateway } from "./noqodi";
import { NeopayGateway } from "./neopay";
import { hasStripe, hasTap, hasNoqodi, hasNeopay, hasTabby, hasTamara } from "./config";
import type { PaymentGateway } from "./gateway";

// NOTE: the authoritative environment gate for external providers lives in the checkout server action
// (placeOrder → providerAvailable). This factory config-gates each provider for defense-in-depth so an
// unconfigured provider degrades to the Simulated gateway (local testing) rather than a real half-wired one.
export function getGateway(method: string): PaymentGateway {
  switch (method) {
    case "CARD":
      return hasStripe() ? new StripeGateway() : new SimulatedGateway();
    case "TABBY":
      return hasTabby() ? new TabbyGateway() : new SimulatedGateway();
    case "TAMARA":
      return hasTamara() ? new TamaraGateway() : new SimulatedGateway();
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
