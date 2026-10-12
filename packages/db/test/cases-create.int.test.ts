import { describe, it, expect } from "vitest";
import { prisma } from "../src";
import { createCase } from "../src/cases";
import { makeCategory, caseInput } from "./factories";

describe("createCase (integration)", () => {
  it("creates a NEW case, a CREATED event, and a case.created outbox event", async () => {
    const cat = await makeCategory({ defaultPriority: "HIGH" });
    const res = await createCase(caseInput(cat.id));

    const c = await prisma.case.findUnique({ where: { id: res.id } });
    expect(c?.status).toBe("NEW");
    expect(c?.priority).toBe("HIGH"); // inherited from category default
    expect(c?.caseNumber).toMatch(/^CS-\d{4}-\d{5}$/);
    expect(c?.resolutionDueAt).toBeInstanceOf(Date);

    const events = await prisma.caseEvent.findMany({ where: { caseId: res.id } });
    expect(events.map((e) => e.type)).toContain("CREATED");

    const outbox = await prisma.outboxEvent.findFirst({
      where: { type: "case.created", payload: { path: ["caseId"], equals: res.id } },
    });
    expect(outbox).not.toBeNull();
  });

  it("honors an explicit priority override", async () => {
    const cat = await makeCategory({ defaultPriority: "LOW" });
    const res = await createCase(caseInput(cat.id, { priority: "URGENT" }));
    const c = await prisma.case.findUnique({ where: { id: res.id } });
    expect(c?.priority).toBe("URGENT");
  });
});
