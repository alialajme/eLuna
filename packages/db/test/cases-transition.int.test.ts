import { describe, it, expect } from "vitest";
import { prisma } from "../src";
import { createCase, assignCase, transitionCase } from "../src/cases";
import { CaseTransitionError } from "../src/case-status";
import { makeCategory, caseInput } from "./factories";

describe("assignCase + transitionCase (integration)", () => {
  it("assignCase moves NEW -> ASSIGNED, sets assignee + team + ASSIGNED event + outbox", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    await assignCase({ caseId: id, assignedToUserId: "agent1", assignedTeam: "SUPPORT", actorUserId: "admin1" });

    const c = await prisma.case.findUnique({ where: { id } });
    expect(c?.status).toBe("ASSIGNED");
    expect(c?.assignedToUserId).toBe("agent1");
    expect(c?.assignedTeam).toBe("SUPPORT");
    const outbox = await prisma.outboxEvent.findFirst({ where: { type: "case.assigned", payload: { path: ["caseId"], equals: id } } });
    expect(outbox).not.toBeNull();
  });

  it("transitionCase rejects illegal transitions", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    await expect(transitionCase({ caseId: id, to: "CLOSED", actorUserId: "admin1" })).rejects.toBeInstanceOf(CaseTransitionError);
  });

  it("transitionCase applies a legal transition + STATUS_CHANGED event", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    await transitionCase({ caseId: id, to: "IN_PROGRESS", actorUserId: "admin1" });
    const c = await prisma.case.findUnique({ where: { id } });
    expect(c?.status).toBe("IN_PROGRESS");
  });
});
