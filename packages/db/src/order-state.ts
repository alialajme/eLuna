import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { InvalidStateTransitionError } from "./errors";

/**
 * Explicit order lifecycle policy. Manual status writes (checkout, reconcile,
 * admin actions) should assert against this instead of blindly setting a value,
 * so a DELIVERED order can never be silently flipped to CANCELLED.
 *
 * NOTE: forward fulfillment aggregation (CONFIRMED->PROCESSING->SHIPPED->
 * DELIVERED / REFUNDED) is derived from item fulfillment in `recomputeOrderStatus`
 * (order-status.ts). This policy governs the explicit transitions.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"],
  PROCESSING: ["SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"],
  SHIPPED: ["DELIVERED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return from === to || ORDER_TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new InvalidStateTransitionError("Order", from, to);
  }
}

/**
 * Payment lifecycle policy. Distinguishes authorization, capture, failure and
 * refunds. COD sits at PENDING until cash is collected (PENDING -> CAPTURED).
 */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ["AUTHORIZED", "CAPTURED", "FAILED"],
  AUTHORIZED: ["CAPTURED", "FAILED"],
  CAPTURED: ["REFUNDED", "PARTIALLY_REFUNDED"],
  PARTIALLY_REFUNDED: ["REFUNDED", "PARTIALLY_REFUNDED"],
  FAILED: [],
  REFUNDED: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return from === to || PAYMENT_TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new InvalidStateTransitionError("Payment", from, to);
  }
}
