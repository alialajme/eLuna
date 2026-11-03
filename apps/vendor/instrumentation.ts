// Next.js runs register() once when a server instance boots. The vendor app
// settles money too (refunds via the payment gateway in returns.ts), so it runs
// the same payment preflight: log every finding, and in PRODUCTION hard-fail the
// boot on any error-level finding (SIMULATION_ENABLED_IN_PROD) so a prod vendor
// deployment can never silently accept simulated-payment refunds. A correctly-
// configured prod has no error finding and does not throw. Non-production logs only.
export async function register() {
  // nodejs runtime only — avoid pulling the Node payment SDKs into the edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runStartupPreflight } = await import("@ayvana/payments");
  runStartupPreflight({ assert: process.env.NODE_ENV === "production" });
}
