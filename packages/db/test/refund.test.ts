import { describe, it, expect } from "vitest";
import { computeRefundBreakdown } from "../src/ledger";
import { InvalidAmountError } from "../src/errors";

describe("computeRefundBreakdown", () => {
  it("splits gross into commission + net (Decimal exact)", () => {
    const b = computeRefundBreakdown("100.00", "100.00", "0.15");
    expect(b.gross.toString()).toBe("100");
    expect(b.commission.toString()).toBe("15");
    expect(b.net.toString()).toBe("85");
  });

  it("is exact where float would drift", () => {
    const b = computeRefundBreakdown("10.10", "10.10", "0.10");
    expect(b.gross.toString()).toBe("10.1");
    expect(b.commission.toString()).toBe("1.01");
    expect(b.net.toString()).toBe("9.09");
  });

  it("allows a partial refund below the captured value", () => {
    const b = computeRefundBreakdown("40.00", "100.00", "0.15");
    expect(b.gross.toString()).toBe("40");
    expect(b.net.toString()).toBe("34");
  });

  it("rejects a refund exceeding the captured item value", () => {
    expect(() => computeRefundBreakdown("120.00", "100.00", "0.15")).toThrow(InvalidAmountError);
  });

  it("rejects a non-positive refund", () => {
    expect(() => computeRefundBreakdown("0", "100.00", "0.15")).toThrow(InvalidAmountError);
    expect(() => computeRefundBreakdown("-5", "100.00", "0.15")).toThrow(InvalidAmountError);
  });

  it("handles a zero commission rate", () => {
    const b = computeRefundBreakdown("100.00", "100.00", "0");
    expect(b.commission.toString()).toBe("0");
    expect(b.net.toString()).toBe("100");
  });
});
