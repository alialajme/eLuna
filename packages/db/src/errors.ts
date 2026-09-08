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
  | "INVALID_AMOUNT"
  | "VALIDATION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYMENT_PROVIDER"
  | "CONFIGURATION";

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

export class ValidationError extends DomainError {
  constructor(message: string) {
    super("VALIDATION", message);
  }
}

export class AuthenticationError extends DomainError {
  constructor(message = "Authentication required") {
    super("AUTHENTICATION", message);
  }
}

export class AuthorizationError extends DomainError {
  constructor(message = "Not authorized") {
    super("AUTHORIZATION", message);
  }
}

export class NotFoundError extends DomainError {
  constructor(entity = "Resource") {
    super("NOT_FOUND", `${entity} not found`);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super("CONFLICT", message);
  }
}

export class PaymentProviderError extends DomainError {
  constructor(message: string) {
    super("PAYMENT_PROVIDER", message);
  }
}

export class ConfigurationError extends DomainError {
  constructor(message: string) {
    super("CONFIGURATION", message);
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}

// Map an error code to an HTTP status. Central so API routes stay consistent.
const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  VALIDATION: 400,
  INVALID_AMOUNT: 400,
  AUTHENTICATION: 401,
  AUTHORIZATION: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
  INSUFFICIENT_INVENTORY: 409,
  INSUFFICIENT_FUNDS: 402,
  PAYMENT_PROVIDER: 502,
  CONFIGURATION: 500,
};

export function httpStatusForError(e: unknown): number {
  return isDomainError(e) ? STATUS_BY_CODE[e.code] : 500;
}

// Safe, non-leaking user-facing message per code. Never returns raw internals /
// stack traces / provider responses. Falls back to a generic message.
const SAFE_MESSAGE_BY_CODE: Record<DomainErrorCode, string> = {
  VALIDATION: "Some of the submitted data is invalid.",
  INVALID_AMOUNT: "That amount isn't valid.",
  AUTHENTICATION: "Please sign in to continue.",
  AUTHORIZATION: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  CONFLICT: "That action conflicts with the current state. Please refresh and retry.",
  INVALID_STATE_TRANSITION: "That change isn't allowed from the current state.",
  INSUFFICIENT_INVENTORY: "Sorry — one or more items just sold out.",
  INSUFFICIENT_FUNDS: "Your balance is too low for this.",
  PAYMENT_PROVIDER: "The payment provider is temporarily unavailable. Please try again.",
  CONFIGURATION: "Something went wrong. Please try again.",
};

export function toSafeMessage(e: unknown): string {
  return isDomainError(e) ? SAFE_MESSAGE_BY_CODE[e.code] : "Something went wrong. Please try again.";
}
