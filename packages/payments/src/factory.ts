import { SimulatedGateway } from "./simulated";
import { TabbyGateway } from "./tabby";
import { TamaraGateway } from "./tamara";
import { StripeGateway } from "./stripe";
import { TapGateway } from "./tap";
import { NoqodiGateway } from "./noqodi";
import { NeopayGateway } from "./neopay";
import {
  hasStripe,
  hasTap,
  hasNoqodi,
  hasNeopay,
  hasTabby,
  hasTamara,
  simulationAllowed,
  PaymentProviderUnavailableError,
} from "./config";
import type { PaymentGateway } from "./gateway";

/**
 * Return the configured real gateway, or fail closed. When the provider is not
 * configured we fall back to the Simulated gateway ONLY where simulation is
 * allowed (non-prod / staging escape hatch); in real production we throw rather
 * than hand back a gateway that would "capture" for free. This is defense in
 * depth alongside checkout's `providerAvailable()` gate and SimulatedGateway's
 * own production guard — no single layer is trusted on its own.
 */
function realOrSafe(method: string, configured: boolean, makeReal: () => PaymentGateway): PaymentGateway {
  if (configured) return makeReal();
  if (simulationAllowed()) return new SimulatedGateway();
  throw new PaymentProviderUnavailableError(method);
}

export function getGateway(method: string): PaymentGateway {
  switch (method) {
    case "CARD":
      return realOrSafe(method, hasStripe(), () => new StripeGateway());
    case "TABBY":
      return realOrSafe(method, hasTabby(), () => new TabbyGateway());
    case "TAMARA":
      return realOrSafe(method, hasTamara(), () => new TamaraGateway());
    case "TAP":
      return realOrSafe(method, hasTap(), () => new TapGateway());
    case "NOQODI":
      return realOrSafe(method, hasNoqodi(), () => new NoqodiGateway());
    case "NEOPAY":
      return realOrSafe(method, hasNeopay(), () => new NeopayGateway());
    case "LUNA_WALLET":
    case "CASH_ON_DELIVERY":
    default:
      // Internal methods (wallet debit / COD) never settle through an external
      // gateway — checkout handles them directly before reaching here. Still fail
      // closed so prod never gets a capturing Simulated gateway for these either.
      if (simulationAllowed()) return new SimulatedGateway();
      throw new PaymentProviderUnavailableError(method);
  }
}
