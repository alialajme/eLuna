/**
 * Typed domain errors for financial / inventory operations.
 *
 * These carry a stable `code` so callers (server actions, API routes) can map
 * them to safe user-facing messages without leaking internals, and structured
 * fields for server-side diagnosis. Never surface `.message` verbatim to
 * customers for the money/stock paths — map on `code`.
 */
export type DomainErrorCode =
  | "INSUFFICIENT_INVENTORY"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_STATE_TRANSITION"
  | "INVALID_AMOUNT";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InsufficientInventoryError extends DomainError {
  readonly variantId: string;
  readonly requested: number;
  readonly available: number;
  constructor(variantId: string, requested: number, available: number) {
    super(
      "INSUFFICIENT_INVENTORY",
      `Insufficient stock for variant ${variantId}: requested ${requested}, available ${available}`,
    );
    this.variantId = variantId;
    this.requested = requested;
    this.available = available;
  }
}

export class InsufficientFundsError extends DomainError {
  readonly customerProfileId: string;
  readonly requested: string;
  readonly available: string;
  constructor(customerProfileId: string, requested: string, available: string) {
    super(
      "INSUFFICIENT_FUNDS",
      `Insufficient wallet balance for ${customerProfileId}: requested ${requested}, available ${available}`,
    );
    this.customerProfileId = customerProfileId;
    this.requested = requested;
    this.available = available;
  }
}

export class InvalidStateTransitionError extends DomainError {
  readonly entity: string;
  readonly from: string;
  readonly to: string;
  constructor(entity: string, from: string, to: string) {
    super("INVALID_STATE_TRANSITION", `Invalid ${entity} transition: ${from} -> ${to}`);
    this.entity = entity;
    this.from = from;
    this.to = to;
  }
}

export class InvalidAmountError extends DomainError {
  constructor(message: string) {
    super("INVALID_AMOUNT", message);
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
