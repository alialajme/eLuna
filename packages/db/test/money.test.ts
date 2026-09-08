import { describe, it, expect } from "vitest";
import { computeCartPricing, money, round2, lineTotal } from "../src/money";
import { InvalidAmountError } from "../src/errors";

describe("money.computeCartPricing", () => {
  it("computes subtotal/shipping/total below the free-shipping threshold", () => {
    const p = computeCartPricing([{ unitPrice: "100.00", quantity: 2 }], {
      freeShippingThreshold: 500,
      shippingFee: 15,
    });
    expect(p.subtotal.toString()).toBe("200");
    expect(p.shippingFee.toString()).toBe("15");
    expect(p.total.toString()).toBe("215");
  });

  it("waives shipping at or above the threshold", () => {
    const p = computeCartPricing([{ unitPrice: "250", quantity: 2 }], {
      freeShippingThreshold: 500,
      shippingFee: 15,
    });
    expect(p.subtotal.toString()).toBe("500");
    expect(p.shippingFee.toString()).toBe("0");
    expect(p.total.toString()).toBe("500");
  });

  it("is exact where IEEE-754 floats drift (0.1 * 3 family)", () => {
    // 10.10 * 10 === 101.00000000000001 in float; Decimal must be exact.
    const p = computeCartPricing([{ unitPrice: "10.10", quantity: 10 }], {
      freeShippingThreshold: 1000,
      shippingFee: 15,
    });
    expect(p.subtotal.toString()).toBe("101");
    expect(p.total.toString()).toBe("116");
    // And the classic 0.1 + 0.2:
    expect(money("0.1").plus(money("0.2")).toString()).toBe("0.3");
  });

  it("sums multiple lines exactly", () => {
    const p = computeCartPricing(
      [
        { unitPrice: "19.99", quantity: 3 },
        { unitPrice: "5.55", quantity: 7 },
      ],
      { freeShippingThreshold: 500, shippingFee: 20 },
    );
    // 59.97 + 38.85 = 98.82
    expect(p.subtotal.toString()).toBe("98.82");
    expect(p.total.toString()).toBe("118.82");
  });

  it("rounds half-up to 2dp", () => {
    expect(round2("1.005").toString()).toBe("1.01");
    expect(round2("1.004").toString()).toBe("1");
  });

  it("rejects non-integer / non-positive quantities", () => {
    expect(() => computeCartPricing([{ unitPrice: "1", quantity: 0 }], { freeShippingThreshold: 1, shippingFee: 1 })).toThrow(InvalidAmountError);
    expect(() => computeCartPricing([{ unitPrice: "1", quantity: 1.5 }], { freeShippingThreshold: 1, shippingFee: 1 })).toThrow(InvalidAmountError);
    expect(() => computeCartPricing([{ unitPrice: "1", quantity: -2 }], { freeShippingThreshold: 1, shippingFee: 1 })).toThrow(InvalidAmountError);
  });

  it("rejects negative prices", () => {
    expect(() => computeCartPricing([{ unitPrice: "-1", quantity: 1 }], { freeShippingThreshold: 1, shippingFee: 1 })).toThrow(InvalidAmountError);
  });

  it("lineTotal multiplies exactly", () => {
    expect(lineTotal("0.07", 3).toString()).toBe("0.21");
  });
});
