import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  checkPaymentConfig,
  assertPaymentConfig,
  runStartupPreflight,
  PaymentConfigError,
} from "../src/preflight";

// These read process.env through the config helpers; isolate env per test.
const PROVIDER_KEYS = [
  "STRIPE_SECRET_KEY",
  "TABBY_API_KEY",
  "TAMARA_API_KEY",
  "TAP_SECRET_KEY",
  "NOQODI_API_KEY",
  "NEOPAY_API_KEY",
];

describe("payment preflight", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.NODE_ENV = process.env.NODE_ENV;
    saved.ALLOW_SIMULATED_PAYMENTS = process.env.ALLOW_SIMULATED_PAYMENTS;
    for (const k of PROVIDER_KEYS) saved[k] = process.env[k];
    // Clean slate: non-prod, no keys, no escape hatch.
    process.env.NODE_ENV = "test";
    delete process.env.ALLOW_SIMULATED_PAYMENTS;
    for (const k of PROVIDER_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const codes = (fs: ReturnType<typeof checkPaymentConfig>) => fs.map((f) => f.code);

  it("non-production with no keys reports a single info OK", () => {
    const fs = checkPaymentConfig();
    expect(fs).toHaveLength(1);
    expect(fs[0].level).toBe("info");
    expect(fs[0].code).toBe("OK");
    expect(assertPaymentConfig()).toEqual(fs); // never throws
  });

  it("production with a configured real provider and nothing else is clean", () => {
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_dummy";
    const fs = checkPaymentConfig();
    expect(codes(fs)).toEqual(["OK"]);
    expect(fs[0].level).toBe("info");
    expect(() => assertPaymentConfig()).not.toThrow();
  });

  it("ERROR: simulation enabled in production (and assert throws)", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_SIMULATED_PAYMENTS = "true";
    process.env.STRIPE_SECRET_KEY = "sk_live_dummy"; // isolate the simulation finding
    const fs = checkPaymentConfig();
    const err = fs.find((f) => f.code === "SIMULATION_ENABLED_IN_PROD");
    expect(err?.level).toBe("error");
    expect(() => assertPaymentConfig()).toThrow(PaymentConfigError);
  });

  it("WARN: no real provider configured in production (assert does not throw)", () => {
    process.env.NODE_ENV = "production";
    const fs = checkPaymentConfig();
    const warn = fs.find((f) => f.code === "NO_REAL_PROVIDER");
    expect(warn?.level).toBe("warn");
    expect(fs.some((f) => f.level === "error")).toBe(false);
    expect(() => assertPaymentConfig()).not.toThrow();
  });

  it("WARN: a scaffold key is set but the adapter is a stub", () => {
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_dummy"; // avoid NO_REAL_PROVIDER noise
    process.env.TABBY_API_KEY = "tabby_dummy";
    const fs = checkPaymentConfig();
    const warn = fs.find((f) => f.code === "SCAFFOLD_CONFIGURED_TABBY");
    expect(warn?.level).toBe("warn");
    expect(warn?.message).toMatch(/fail closed/i);
    expect(() => assertPaymentConfig()).not.toThrow();
  });

  it("the escape hatch error and a scaffold warning can co-exist", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_SIMULATED_PAYMENTS = "true";
    process.env.NEOPAY_API_KEY = "neo_dummy";
    const fs = checkPaymentConfig();
    expect(codes(fs)).toContain("SIMULATION_ENABLED_IN_PROD");
    expect(codes(fs)).toContain("SCAFFOLD_CONFIGURED_NEOPAY");
    // assert throws (only error-level findings are fatal) but surfaces both.
    try {
      assertPaymentConfig();
      throw new Error("expected assertPaymentConfig to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(PaymentConfigError);
      expect((e as PaymentConfigError).findings.every((f) => f.level === "error")).toBe(true);
    }
  });

  describe("runStartupPreflight (instrumentation boot gate)", () => {
    it("does NOT throw in production when no override is set (correct prod + real provider)", () => {
      process.env.NODE_ENV = "production";
      process.env.STRIPE_SECRET_KEY = "sk_live_dummy";
      expect(() => runStartupPreflight({ assert: true })).not.toThrow();
    });

    it("THROWS in production when ALLOW_SIMULATED_PAYMENTS is set (hard fail-fast)", () => {
      process.env.NODE_ENV = "production";
      process.env.ALLOW_SIMULATED_PAYMENTS = "true";
      process.env.STRIPE_SECRET_KEY = "sk_live_dummy";
      expect(() => runStartupPreflight({ assert: true })).toThrow(PaymentConfigError);
    });

    it("never throws when assert is false (log-only / non-prod boot)", () => {
      process.env.NODE_ENV = "production";
      process.env.ALLOW_SIMULATED_PAYMENTS = "true";
      expect(() => runStartupPreflight({ assert: false })).not.toThrow();
      expect(() => runStartupPreflight()).not.toThrow(); // default: no assert
    });
  });
});
