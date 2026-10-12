import { describe, it, expect } from "vitest";
import { prisma } from "../src";
import { createCase, addCaseMessage } from "../src/cases";
import { makeCategory, caseInput } from "./factories";

describe("addCaseMessage (integration)", () => {
  it("appends a message, a MESSAGE event, and a case.message_added outbox event", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    const res = await addCaseMessage({ caseId: id, authorRole: "CUSTOMER", body: "any update?", channel: "WEBSITE" });

    const msg = await prisma.caseMessage.findUnique({ where: { id: res.id } });
    expect(msg?.body).toBe("any update?");
    const outbox = await prisma.outboxEvent.findFirst({
      where: { type: "case.message_added", payload: { path: ["messageId"], equals: res.id } },
    });
    expect(outbox).not.toBeNull();
  });

  it("stamps firstRespondedAt on the first HANDLER reply only", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));

    await addCaseMessage({ caseId: id, authorRole: "CUSTOMER", body: "hello", channel: "WEBSITE" });
    let c = await prisma.case.findUnique({ where: { id } });
    expect(c?.firstRespondedAt).toBeNull(); // customer message is not a response

    await addCaseMessage({ caseId: id, authorRole: "SUPPORT", authorUserId: "agent1", body: "on it", channel: "WEBSITE" });
    c = await prisma.case.findUnique({ where: { id } });
    const firstAt = c?.firstRespondedAt;
    expect(firstAt).toBeInstanceOf(Date);

    await addCaseMessage({ caseId: id, authorRole: "SUPPORT", authorUserId: "agent1", body: "again", channel: "WEBSITE" });
    c = await prisma.case.findUnique({ where: { id } });
    expect(c?.firstRespondedAt?.getTime()).toBe(firstAt?.getTime()); // unchanged
  });

  it("does NOT stamp firstRespondedAt when a HANDLER message is an internal note", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));

    await addCaseMessage({ caseId: id, authorRole: "SUPPORT", authorUserId: "agent1", body: "internal note", channel: "WEBSITE", isInternal: true });
    const c = await prisma.case.findUnique({ where: { id } });
    expect(c?.firstRespondedAt).toBeNull();
  });
});
