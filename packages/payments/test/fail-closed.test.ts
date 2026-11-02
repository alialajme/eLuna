import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getGateway } from "../src/factory";
import { SimulatedGateway } from "../src/simulated";
import { StripeGateway } from "../src/stripe";
import { PaymentProviderUnavailableError } from "../src/config";

// Production payment safety (§6): no production code path may successfully
// simulate a financial capture. These tests drive the environment directly.

const PROVIDER_KEYS = [
  "STRIPE_SECRET_KEY",
  "TABBY_API_KEY",
  "TAMARA_API_KEY",
  "TAP_SECRET_KEY",
  "NOQODI_API_KEY",
  "NEOPAY_API_KEY",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = { NODE_ENV: process.env.NODE_ENV, ALLOW_SIMULATED_PAYMENTS: process.env.ALLOW_SIMULATED_PAYMENTS };
  for (const k of PROVIDER_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  delete process.env.ALLOW_SIMULATED_PAYMENTS;
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("payment fail-closed (production safety)", () => {
  it("production cannot instantiate a SimulatedGateway", () => {
    process.env.NODE_ENV = "production";
    expect(() => new SimulatedGateway()).toThrow(/disabled in production/i);
  });

  it("production + missing Stripe credentials fails closed (no captured payment)", () => {
    process.env.NODE_ENV = "production";
    expect(() => getGateway("CARD")).toThrow(PaymentProviderUnavailableError);
  });

  it("production + missing credentials fails closed for every external provider", () => {
    process.env.NODE_ENV = "production";
    for (const method of ["CARD", "TABBY", "TAMARA", "TAP", "NOQODI", "NEOPAY"]) {
      expect(() => getGateway(method), `method ${method}`).toThrow(PaymentProviderUnavailableError);
    }
  });

  it("production internal methods (wallet/COD) also never return a capturing Simulated gateway", () => {
    process.env.NODE_ENV = "production";
    expect(() => getGateway("LUNA_WALLET")).toThrow(PaymentProviderUnavailableError);
    expect(() => getGateway("CASH_ON_DELIVERY")).toThrow(PaymentProviderUnavailableError);
  });

  it("a simulated capture can never settle in production (cannot even be constructed)", () => {
    process.env.NODE_ENV = "production";
    // There is no path to a `{ status: "captured" }` result: the gateway throws
    // before createPayment can run.
    expect(() => getGateway("TABBY")).toThrow();
  });

  it("development simulation remains available (keyless local/dev captures)", async () => {
    process.env.NODE_ENV = "development";
    const gw = getGateway("TABBY");
    expect(gw).toBeInstanceOf(SimulatedGateway);
    const res = await gw.createPayment({ orderId: "o1", amount: 100, currency: "AED" });
    expect(res.status).toBe("captured");
  });

  it("test environment simulation remains available", () => {
    process.env.NODE_ENV = "test";
    expect(getGateway("NEOPAY")).toBeInstanceOf(SimulatedGateway);
  });

  it("production returns the REAL gateway when the provider is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_offline";
    const gw = getGateway("CARD");
    expect(gw).toBeInstanceOf(StripeGateway);
    expect(gw).not.toBeInstanceOf(SimulatedGateway);
  });

  it("explicit staging escape hatch re-enables simulation in production", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_SIMULATED_PAYMENTS = "true";
    expect(() => new SimulatedGateway()).not.toThrow();
    expect(getGateway("TABBY")).toBeInstanceOf(SimulatedGateway);
  });
});
