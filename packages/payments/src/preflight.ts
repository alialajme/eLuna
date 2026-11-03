import {
  isProd,
  simulationAllowed,
  hasStripe,
  hasTabby,
  hasTamara,
  hasTap,
  hasNoqodi,
  hasNeopay,
} from "./config";

export type PreflightLevel = "error" | "warn" | "info";

export type PreflightFinding = {
  level: PreflightLevel;
  code: string;
  message: string;
};

// Providers whose adapter is still an un-wired scaffold. Post V2-003 a set key
// makes checkout fail closed for that method, so the operator should be told the
// method won't actually process until the real SDK lands — otherwise a key set
// "to enable Tabby" silently disables Tabby checkout instead.
const SCAFFOLD_PROVIDERS: Array<{ code: string; name: string; configured: () => boolean }> = [
  { code: "TABBY", name: "Tabby", configured: hasTabby },
  { code: "TAMARA", name: "Tamara", configured: hasTamara },
  { code: "TAP", name: "Tap", configured: hasTap },
  { code: "NOQODI", name: "Noqodi", configured: hasNoqodi },
  { code: "NEOPAY", name: "NeoPay", configured: hasNeopay },
];

/**
 * Inspect the current payment configuration for deploy-time hazards. Pure and
 * read-only (reads process.env through the config helpers); returns structured
 * findings so a caller can log them and/or fail the boot. Intended to run once
 * at server startup (e.g. a Next.js instrumentation `register()` hook) and/or in
 * a deploy preflight. Severity:
 *   - error: unsafe in production (e.g. simulated captures enabled)
 *   - warn:  a method won't work / no real provider — operational, not fatal
 *   - info:  all clear (exactly one, only when there are no error/warn findings)
 */
export function checkPaymentConfig(): PreflightFinding[] {
  const findings: PreflightFinding[] = [];
  const prod = isProd();

  // The single most dangerous setting: simulated captures enabled in production.
  if (prod && simulationAllowed()) {
    findings.push({
      level: "error",
      code: "SIMULATION_ENABLED_IN_PROD",
      message:
        "ALLOW_SIMULATED_PAYMENTS=true in production — the Simulated gateway can 'capture' payments without moving money. Unset it unless this is a staging deployment.",
    });
  }

  // No real provider configured at all → nothing can actually be charged.
  if (prod && !hasStripe()) {
    findings.push({
      level: "warn",
      code: "NO_REAL_PROVIDER",
      message:
        "No real payment provider is configured (STRIPE_SECRET_KEY unset). Card checkout will fail closed in production.",
    });
  }

  // A scaffold key is set but the adapter is still a stub → fails closed (V2-003).
  for (const p of SCAFFOLD_PROVIDERS) {
    if (p.configured()) {
      findings.push({
        level: "warn",
        code: `SCAFFOLD_CONFIGURED_${p.code}`,
        message: `${p.name} credentials are set but its adapter is not yet implemented — ${p.name} checkout will fail closed until the real SDK is wired.`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      level: "info",
      code: "OK",
      message: prod
        ? "Payment configuration looks safe for production."
        : "Non-production environment — the Simulated gateway stands in for unconfigured providers.",
    });
  }

  return findings;
}

export class PaymentConfigError extends Error {
  readonly findings: PreflightFinding[];
  constructor(findings: PreflightFinding[]) {
    super(
      "Unsafe payment configuration:\n" +
        findings.map((f) => `  [${f.level.toUpperCase()}] ${f.code}: ${f.message}`).join("\n"),
    );
    this.name = "PaymentConfigError";
    this.findings = findings;
  }
}

/**
 * Boot-time hard gate: throw `PaymentConfigError` if any error-level finding is
 * present (e.g. simulated payments enabled in production). Returns all findings
 * otherwise so the caller can log the warnings. Call from app startup to fail
 * fast rather than silently booting a money-unsafe deployment.
 */
export function assertPaymentConfig(): PreflightFinding[] {
  const findings = checkPaymentConfig();
  const errors = findings.filter((f) => f.level === "error");
  if (errors.length > 0) throw new PaymentConfigError(errors);
  return findings;
}

/**
 * Startup preflight for an app's instrumentation `register()` hook: logs every
 * finding (so warnings are visible in the first lines of the server log), then —
 * when `assert` is true — THROWS on any error-level finding so a money-unsafe
 * production boot fails fast instead of silently accepting e.g. simulated
 * payments. In production we assert; the only error-level finding is
 * `SIMULATION_ENABLED_IN_PROD`, so a correctly-configured prod never throws and
 * the CI production build (no override set) is unaffected.
 */
export function runStartupPreflight(opts: { assert?: boolean } = {}): PreflightFinding[] {
  const findings = checkPaymentConfig();
  for (const f of findings) {
    const line = `[payments-preflight] ${f.code}: ${f.message}`;
    if (f.level === "error") console.error(line);
    else if (f.level === "warn") console.warn(line);
    else console.info(line);
  }
  if (opts.assert) {
    const errors = findings.filter((f) => f.level === "error");
    if (errors.length > 0) throw new PaymentConfigError(errors);
  }
  return findings;
}
