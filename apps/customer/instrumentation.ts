// Next.js runs register() once when a server instance boots. We use it to log a
// payment-config preflight so a money-unsafe deployment is visible in the very
// first lines of the server log (e.g. ALLOW_SIMULATED_PAYMENTS=true in prod, or a
// BNPL key set against a still-stubbed adapter). Log-only by design — it never
// throws, so it can never break boot or the production build; operators who want
// a hard fail-fast gate can call `assertPaymentConfig()` here instead.
export async function register() {
  // nodejs runtime only — avoid pulling the Node payment SDKs into the edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checkPaymentConfig } = await import("@ayvana/payments");
  for (const f of checkPaymentConfig()) {
    const line = `[payments-preflight] ${f.code}: ${f.message}`;
    if (f.level === "error") console.error(line);
    else if (f.level === "warn") console.warn(line);
    else console.info(line);
  }
}
