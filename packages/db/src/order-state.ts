import type { OrderStatus, PaymentStatus, PayoutStatus } from "@prisma/client";
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

/**
 * Payout lifecycle policy. COMPLETED and FAILED are terminal — a completed
 * payout can never silently revert (which would let its amount be paid twice).
 */
export const PAYOUT_TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]> = {
  PENDING: ["PROCESSING", "COMPLETED", "FAILED"],
  PROCESSING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

export function canTransitionPayout(from: PayoutStatus, to: PayoutStatus): boolean {
  return from === to || PAYOUT_TRANSITIONS[from].includes(to);
}

export function assertPayoutTransition(from: PayoutStatus, to: PayoutStatus): void {
  if (!canTransitionPayout(from, to)) {
    throw new InvalidStateTransitionError("Payout", from, to);
  }
}
