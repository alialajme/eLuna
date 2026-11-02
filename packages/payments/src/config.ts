export const hasStripe = () => !!process.env.STRIPE_SECRET_KEY;
export const hasTap = () => !!process.env.TAP_SECRET_KEY;
export const hasNoqodi = () => !!process.env.NOQODI_API_KEY;
export const hasNeopay = () => !!process.env.NEOPAY_API_KEY;
export const hasTabby = () => !!process.env.TABBY_API_KEY;
export const hasTamara = () => !!process.env.TAMARA_API_KEY;

const nonProd = () => process.env.NODE_ENV !== "production";

export const isProd = () => process.env.NODE_ENV === "production";

/**
 * Whether the Simulated gateway may run. True in any non-production environment
 * (local/dev/test/CI, where simulation stands in for real providers), OR in
 * production ONLY behind an explicit, documented escape hatch for a staging-like
 * deployment. In real production this is false, so a simulated "capture" can
 * never settle real money — the single most important payment-safety invariant.
 */
export const simulationAllowed = () => nonProd() || process.env.ALLOW_SIMULATED_PAYMENTS === "true";

/** Thrown when no real gateway is configured for a method and simulation is disabled (production). */
export class PaymentProviderUnavailableError extends Error {
  constructor(method: string) {
    super(
      `No real payment gateway is configured for "${method}" and the Simulated gateway is disabled in production. ` +
        `Configure the provider's credentials, or set ALLOW_SIMULATED_PAYMENTS=true only in a non-production staging environment.`,
    );
    this.name = "PaymentProviderUnavailableError";
  }
}

/**
 * Whether an external payment provider may be offered/accepted in the current environment.
 * A provider is available only when its real gateway is configured, OR in non-production (where the
 * Simulated gateway stands in for local testing). This is the server-side chokepoint that prevents a
 * crafted request from selecting an unconfigured provider whose Simulated fallback would "capture" for
 * free in production. Synchronous internal methods (LUNA_WALLET, CASH_ON_DELIVERY) are handled separately.
 */
export function providerAvailable(method: string): boolean {
  switch (method) {
    case "NEOPAY":
      return hasNeopay() || nonProd();
    case "TAP":
      return hasTap() || nonProd();
    case "NOQODI":
      return hasNoqodi() || nonProd();
    case "TABBY":
      return hasTabby() || nonProd();
    case "TAMARA":
      return hasTamara() || nonProd();
    default:
      return false;
  }
}

export const neopayAvailable = () => providerAvailable("NEOPAY");

export function stripeConfig() {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not set");
  return { secret, webhookSecret };
}
