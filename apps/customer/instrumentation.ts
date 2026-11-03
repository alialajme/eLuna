// Next.js runs register() once when a server instance boots. We run the payment
// preflight here: it logs every finding, and in PRODUCTION it hard-fails the boot
// on any error-level finding — most importantly SIMULATION_ENABLED_IN_PROD
// (ALLOW_SIMULATED_PAYMENTS=true), so a prod deployment can never silently accept
// simulated-payment captures. A correctly-configured prod has no error finding,
// so it does not throw (and the CI production build, with no override set, is
// unaffected). Non-production logs only.
export async function register() {
  // nodejs runtime only — avoid pulling the Node payment SDKs into the edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runStartupPreflight } = await import("@ayvana/payments");
  runStartupPreflight({ assert: process.env.NODE_ENV === "production" });
}
