import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getEInvoiceGateway, SimulatedEInvoice, FtaEInvoice } from "../src";
import type { IssueParams, IssueResult } from "../src";

const PARAMS: IssueParams = {
  invoiceNumber: "INV-2026-0001",
  seller: { name: "Seller", trn: "100000000000003" },
  buyer: { name: "Buyer" },
  subtotal: 100,
  vatRate: 0.05,
  vatAmount: 5,
  total: 105,
  lines: [{ description: "Fabric", quantity: 1, unitPrice: 100, lineTotal: 100 }],
};

const FTA_KEYS = ["FTA_ACCESS_POINT_URL", "FTA_API_KEY"];

function assertShape(r: IssueResult) {
  if (r.status === "issued") {
    expect(r.externalRef === null || typeof r.externalRef === "string").toBe(true);
  } else if (r.status === "failed") {
    expect(typeof r.error).toBe("string");
  } else {
    throw new Error(`unknown status: ${JSON.stringify(r)}`);
  }
}

describe("e-invoice gateway contract", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of FTA_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of FTA_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("factory never throws; no FTA creds → SimulatedEInvoice (local compliant issuing)", async () => {
    const g = getEInvoiceGateway();
    expect(g).toBeInstanceOf(SimulatedEInvoice);
    const r = await g.issue(PARAMS);
    assertShape(r);
    expect(r.status).toBe("issued");
    if (r.status === "issued") expect(r.externalRef).toBeNull();
  });

  it("partial FTA creds (URL only, or key only) still fall back to Simulated", () => {
    process.env.FTA_ACCESS_POINT_URL = "https://ap.example";
    expect(getEInvoiceGateway()).toBeInstanceOf(SimulatedEInvoice);
    delete process.env.FTA_ACCESS_POINT_URL;
    process.env.FTA_API_KEY = "k";
    expect(getEInvoiceGateway()).toBeInstanceOf(SimulatedEInvoice);
  });

  it("fully-configured-but-unimplemented FTA transmitter fails closed, never fakes clearance", async () => {
    process.env.FTA_ACCESS_POINT_URL = "https://ap.example";
    process.env.FTA_API_KEY = "k";
    const g = getEInvoiceGateway();
    expect(g).toBeInstanceOf(FtaEInvoice);
    const r = await g.issue(PARAMS);
    assertShape(r);
    expect(r.status).toBe("failed"); // must NOT report a fake "issued" transmission
  });
});
