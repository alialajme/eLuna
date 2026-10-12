import type { CaseStatus, CasePriority } from "@prisma/client";

export class CaseTransitionError extends Error {
  constructor(from: CaseStatus, to: CaseStatus) {
    super(`Illegal case transition: ${from} -> ${to}`);
    this.name = "CaseTransitionError";
  }
}

/** Allowed next-states per status. Reopen = RESOLVED|CLOSED -> IN_PROGRESS. */
export const CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "WAITING_CUSTOMER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "RESOLVED", "CANCELLED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"],
  CANCELLED: [],
};

export function canCaseTransition(from: CaseStatus, to: CaseStatus): boolean {
  return CASE_TRANSITIONS[from].includes(to);
}

export function assertCaseTransition(from: CaseStatus, to: CaseStatus): void {
  if (!canCaseTransition(from, to)) throw new CaseTransitionError(from, to);
}

/** Target hours per priority: [firstResponse, resolution]. */
export const SLA_HOURS: Record<CasePriority, { first: number; resolution: number }> = {
  URGENT: { first: 1, resolution: 4 },
  HIGH: { first: 4, resolution: 24 },
  MEDIUM: { first: 12, resolution: 72 },
  LOW: { first: 24, resolution: 168 },
};

export function caseSlaDueDates(priority: CasePriority, from: Date = new Date()) {
  const { first, resolution } = SLA_HOURS[priority];
  return {
    firstResponseDueAt: new Date(from.getTime() + first * 3600_000),
    resolutionDueAt: new Date(from.getTime() + resolution * 3600_000),
  };
}
