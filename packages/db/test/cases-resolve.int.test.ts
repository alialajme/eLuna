import { describe, it, expect } from "vitest";
import { prisma } from "../src";
import { createCase, transitionCase, resolveCase, reopenCase, applyCaseTriage, getCaseDetail, listCases } from "../src/cases";
import { makeCategory, caseInput } from "./factories";

describe("resolve/reopen/triage/read (integration)", () => {
  it("resolveCase sets RESOLVED + resolvedAt + relatedReturnId + outbox", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    await transitionCase({ caseId: id, to: "IN_PROGRESS", actorUserId: "a" });
    await resolveCase({ caseId: id, actorUserId: "a", relatedReturnId: "ret_1", resolutionNote: "refunded" });
    const c = await prisma.case.findUnique({ where: { id } });
    expect(c?.status).toBe("RESOLVED");
    expect(c?.resolvedAt).toBeInstanceOf(Date);
    expect(c?.relatedReturnId).toBe("ret_1");
    const outbox = await prisma.outboxEvent.findFirst({ where: { type: "case.resolved", payload: { path: ["caseId"], equals: id } } });
    expect(outbox).not.toBeNull();
  });

  it("reopenCase goes RESOLVED -> IN_PROGRESS with a REOPENED event", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    await transitionCase({ caseId: id, to: "IN_PROGRESS", actorUserId: "a" });
    await resolveCase({ caseId: id, actorUserId: "a" });
    await reopenCase({ caseId: id, actorUserId: "a" });
    const c = await prisma.case.findUnique({ where: { id } });
    expect(c?.status).toBe("IN_PROGRESS");
    const ev = await prisma.caseEvent.findFirst({ where: { caseId: id, type: "REOPENED" } });
    expect(ev).not.toBeNull();
  });

  it("applyCaseTriage stores suggestions without changing status", async () => {
    const cat = await makeCategory();
    const cat2 = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    await applyCaseTriage(id, { suggestedCategoryId: cat2.id, suggestedPriority: "URGENT" });
    const c = await prisma.case.findUnique({ where: { id } });
    expect(c?.suggestedCategoryId).toBe(cat2.id);
    expect(c?.suggestedPriority).toBe("URGENT");
    expect(c?.status).toBe("NEW");
  });

  it("read helpers: getCaseDetail includes messages+events; listCases filters by status", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    const detail = await getCaseDetail(id);
    expect(detail?.messages).toBeDefined();
    expect(detail?.events.length).toBeGreaterThan(0);
    const open = await listCases({ status: "NEW" });
    expect(open.some((c) => c.id === id)).toBe(true);
  });
});
