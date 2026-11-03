import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { PaymentGateway, CreatePaymentResult, RefundResult } from "../src/gateway";
import { TabbyGateway } from "../src/tabby";
import { TamaraGateway } from "../src/tamara";
import { TapGateway } from "../src/tap";
import { NoqodiGateway } from "../src/noqodi";
import { NeopayGateway } from "../src/neopay";
import { SimulatedGateway } from "../src/simulated";

const PARAMS = {
  amount: 100,
  currency: "AED",
  orderId: "ord_contract_test",
  customerEmail: "buyer@test.local",
  description: "contract test",
};

function assertCreateShape(r: CreatePaymentResult) {
  // The discriminated union is exhaustive: every branch has its required fields.
  switch (r.status) {
    case "captured":
      expect(typeof r.externalRef).toBe("string");
      break;
    case "requires_action":
      expect(typeof r.externalRef).toBe("string");
      expect(typeof r.clientSecret).toBe("string");
      break;
    case "failed":
      expect(typeof r.error).toBe("string");
      break;
    default:
      throw new Error(`Unknown createPayment status: ${JSON.stringify(r)}`);
  }
}

function assertRefundShape(r: RefundResult) {
  expect(typeof r.success).toBe("boolean");
  if (r.error !== undefined) expect(typeof r.error).toBe("string");
}

// Every un-wired provider scaffold. These are reached by the factory ONLY when
// the operator has set the provider's env key — so their behavior IS production
// behavior. Until the real SDK is wired, they MUST fail closed; a scaffold that
// returns "captured" marks an order paid without moving money.
const SCAFFOLDS: Array<[string, () => PaymentGateway]> = [
  ["Tabby", () => new TabbyGateway()],
  ["Tamara", () => new TamaraGateway()],
  ["Tap", () => new TapGateway()],
  ["Noqodi", () => new NoqodiGateway()],
  ["NeoPay", () => new NeopayGateway()],
];

describe("payment provider contract", () => {
  describe.each(SCAFFOLDS)("%s scaffold fails closed", (_name, make) => {
    it("createPayment never reports a capture", async () => {
      const r = await make().createPayment(PARAMS);
      assertCreateShape(r);
      // THE invariant: an un-wired provider must not fake a successful capture.
      expect(r.status).toBe("failed");
      expect(r.status).not.toBe("captured");
    });

    it("refund never reports a success", async () => {
      const r = await make().refund({ externalRef: "ext_1", amount: 100 });
      assertRefundShape(r);
      expect(r.success).toBe(false);
    });
  });

  describe("SimulatedGateway (the only non-prod capture path)", () => {
    // Save/restore env: SimulatedGateway's constructor is production-guarded.
    const saved = { ...process.env };
    beforeEach(() => {
      process.env.NODE_ENV = "test";
      delete process.env.ALLOW_SIMULATED_PAYMENTS;
    });
    afterEach(() => {
      process.env = { ...saved };
    });

    it("captures with a conforming shape when simulation is allowed", async () => {
      const r = await new SimulatedGateway().createPayment(PARAMS);
      assertCreateShape(r);
      expect(r.status).toBe("captured");
    });

    it("refund conforms to the contract", async () => {
      const r = await new SimulatedGateway().refund({ externalRef: "ext_1", amount: 100 });
      assertRefundShape(r);
    });
  });
});
