import { describe, it, expect } from "vitest";
import {
  httpStatusForError,
  toSafeMessage,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  PaymentProviderError,
  InsufficientFundsError,
  isDomainError,
} from "../src/errors";

describe("error taxonomy → HTTP status", () => {
  it("maps codes to appropriate statuses", () => {
    expect(httpStatusForError(new ValidationError("x"))).toBe(400);
    expect(httpStatusForError(new AuthenticationError())).toBe(401);
    expect(httpStatusForError(new AuthorizationError())).toBe(403);
    expect(httpStatusForError(new NotFoundError("Order"))).toBe(404);
    expect(httpStatusForError(new ConflictError("x"))).toBe(409);
    expect(httpStatusForError(new InsufficientFundsError("c", "80", "50"))).toBe(402);
    expect(httpStatusForError(new PaymentProviderError("x"))).toBe(502);
  });

  it("defaults unknown errors to 500", () => {
    expect(httpStatusForError(new Error("raw"))).toBe(500);
    expect(httpStatusForError("nope")).toBe(500);
  });
});

describe("toSafeMessage", () => {
  it("returns non-leaking messages per code", () => {
    expect(toSafeMessage(new AuthorizationError("internal detail"))).toBe(
      "You don't have permission to do that.",
    );
    expect(toSafeMessage(new PaymentProviderError("Stripe raw 500 body"))).not.toContain("Stripe");
  });

  it("never leaks raw error text for unknown errors", () => {
    const msg = toSafeMessage(new Error("SELECT * FROM secret leaked"));
    expect(msg).toBe("Something went wrong. Please try again.");
  });
});

describe("isDomainError", () => {
  it("recognizes domain errors and rejects plain ones", () => {
    expect(isDomainError(new NotFoundError())).toBe(true);
    expect(isDomainError(new Error("x"))).toBe(false);
  });
});
