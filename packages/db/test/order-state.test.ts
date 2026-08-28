import { describe, it, expect } from "vitest";
import {
  canTransitionOrder,
  assertOrderTransition,
  canTransitionPayment,
  assertPaymentTransition,
} from "../src/order-state";
import { InvalidStateTransitionError } from "../src/errors";

describe("order state machine", () => {
  it("allows valid forward transitions", () => {
    expect(canTransitionOrder("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransitionOrder("CONFIRMED", "SHIPPED")).toBe(true);
    expect(canTransitionOrder("SHIPPED", "DELIVERED")).toBe(true);
    expect(canTransitionOrder("DELIVERED", "REFUNDED")).toBe(true);
  });

  it("allows cancellation only before delivery", () => {
    expect(canTransitionOrder("PENDING", "CANCELLED")).toBe(true);
    expect(canTransitionOrder("CONFIRMED", "CANCELLED")).toBe(true);
    expect(canTransitionOrder("DELIVERED", "CANCELLED")).toBe(false);
    expect(canTransitionOrder("REFUNDED", "CANCELLED")).toBe(false);
  });

  it("treats identity as a no-op (idempotent writes)", () => {
    expect(canTransitionOrder("CONFIRMED", "CONFIRMED")).toBe(true);
  });

  it("rejects backward / terminal transitions", () => {
    expect(canTransitionOrder("DELIVERED", "SHIPPED")).toBe(false);
    expect(canTransitionOrder("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransitionOrder("REFUNDED", "DELIVERED")).toBe(false);
  });

  it("assertOrderTransition throws typed error on invalid", () => {
    expect(() => assertOrderTransition("DELIVERED", "CANCELLED")).toThrow(InvalidStateTransitionError);
    try {
      assertOrderTransition("DELIVERED", "CANCELLED");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidStateTransitionError);
      if (e instanceof InvalidStateTransitionError) {
        expect(e.code).toBe("INVALID_STATE_TRANSITION");
        expect(e.entity).toBe("Order");
        expect(e.from).toBe("DELIVERED");
        expect(e.to).toBe("CANCELLED");
      }
    }
    expect(() => assertOrderTransition("PENDING", "CONFIRMED")).not.toThrow();
  });
});

describe("payment state machine", () => {
  it("COD stays PENDING then captures on collection", () => {
    expect(canTransitionPayment("PENDING", "CAPTURED")).toBe(true);
    expect(canTransitionPayment("PENDING", "FAILED")).toBe(true);
    expect(canTransitionPayment("AUTHORIZED", "CAPTURED")).toBe(true);
  });

  it("captured payments can only refund", () => {
    expect(canTransitionPayment("CAPTURED", "REFUNDED")).toBe(true);
    expect(canTransitionPayment("CAPTURED", "PARTIALLY_REFUNDED")).toBe(true);
    expect(canTransitionPayment("CAPTURED", "PENDING")).toBe(false);
  });

  it("rejects capturing a failed/refunded payment", () => {
    expect(canTransitionPayment("FAILED", "CAPTURED")).toBe(false);
    expect(canTransitionPayment("REFUNDED", "CAPTURED")).toBe(false);
  });

  it("assertPaymentTransition throws typed error on invalid", () => {
    expect(() => assertPaymentTransition("FAILED", "CAPTURED")).toThrow(InvalidStateTransitionError);
    expect(() => assertPaymentTransition("PENDING", "CAPTURED")).not.toThrow();
  });
});
