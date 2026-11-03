import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCourierGateway, SimulatedCourier, AramexCourier, DhlCourier } from "../src";
import type { CreateShipmentResult } from "../src";

const PARAMS = {
  reference: "ref_contract",
  courier: "aramex",
  destination: { name: "Buyer", addressLine1: "1 St", city: "Dubai", emirate: "Dubai" },
};

const COURIER_KEYS = ["ARAMEX_API_KEY", "DHL_API_KEY"];

function assertShape(r: CreateShipmentResult) {
  switch (r.status) {
    case "created":
      expect(typeof r.trackingNumber).toBe("string");
      expect(typeof r.externalRef).toBe("string");
      break;
    case "manual":
      break;
    case "failed":
      expect(typeof r.error).toBe("string");
      break;
    default:
      throw new Error(`unknown status: ${JSON.stringify(r)}`);
  }
}

describe("courier gateway contract", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of COURIER_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of COURIER_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("factory never throws and always returns a gateway with createShipment", () => {
    for (const id of ["aramex", "dhl", "fetchr", "unknown-courier", ""]) {
      const g = getCourierGateway(id);
      expect(typeof g.createShipment).toBe("function");
    }
  });

  it("unconfigured couriers fall back to SimulatedCourier (manual tracking, never a fake 'created')", async () => {
    const g = getCourierGateway("aramex");
    expect(g).toBeInstanceOf(SimulatedCourier);
    const r = await g.createShipment(PARAMS);
    assertShape(r);
    expect(r.status).toBe("manual");
    expect(r.status).not.toBe("created");
  });

  it("a configured-but-unimplemented Aramex adapter fails closed, never fake-creates", async () => {
    process.env.ARAMEX_API_KEY = "aramex_dummy";
    const g = getCourierGateway("aramex");
    expect(g).toBeInstanceOf(AramexCourier);
    const r = await g.createShipment(PARAMS);
    assertShape(r);
    expect(r.status).toBe("failed"); // NOT "created" — no fabricated tracking number
  });

  it("a configured-but-unimplemented DHL adapter fails closed", async () => {
    process.env.DHL_API_KEY = "dhl_dummy";
    const g = getCourierGateway("dhl");
    expect(g).toBeInstanceOf(DhlCourier);
    const r = await g.createShipment({ ...PARAMS, courier: "dhl" });
    assertShape(r);
    expect(r.status).toBe("failed");
  });

  it("scaffold parseWebhook ignores unverified events (never advances delivery state)", () => {
    process.env.ARAMEX_API_KEY = "aramex_dummy";
    const g = getCourierGateway("aramex") as AramexCourier;
    const ev = g.parseWebhook("{}", new Headers());
    expect(ev).toEqual({ kind: "ignored" });
  });
});
