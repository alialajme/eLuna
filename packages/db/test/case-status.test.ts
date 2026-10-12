import { describe, it, expect } from "vitest";
import { assertCaseTransition, CaseTransitionError, caseSlaDueDates } from "../src/case-status";

describe("case state machine", () => {
  it("allows NEW -> ASSIGNED and ASSIGNED -> IN_PROGRESS", () => {
    expect(() => assertCaseTransition("NEW", "ASSIGNED")).not.toThrow();
    expect(() => assertCaseTransition("ASSIGNED", "IN_PROGRESS")).not.toThrow();
  });

  it("allows reopen RESOLVED -> IN_PROGRESS and CLOSED -> IN_PROGRESS", () => {
    expect(() => assertCaseTransition("RESOLVED", "IN_PROGRESS")).not.toThrow();
    expect(() => assertCaseTransition("CLOSED", "IN_PROGRESS")).not.toThrow();
  });

  it("rejects illegal NEW -> CLOSED", () => {
    expect(() => assertCaseTransition("NEW", "CLOSED")).toThrow(CaseTransitionError);
  });

  it("computes SLA due dates from priority (URGENT is tighter than LOW)", () => {
    const base = new Date("2026-10-03T00:00:00.000Z");
    const u = caseSlaDueDates("URGENT", base);
    const l = caseSlaDueDates("LOW", base);
    expect(u.resolutionDueAt.getTime()).toBeLessThan(l.resolutionDueAt.getTime());
    expect(u.firstResponseDueAt.getTime()).toBe(base.getTime() + 1 * 3600_000);
  });
});
