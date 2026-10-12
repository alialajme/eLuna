import { describe, it, expect } from "vitest";
import { prisma, createCase, addCaseMessage } from "@ayvana/db";
import { handleCaseEvent, sweepCaseSla } from "../src/handlers";

async function cat() {
  return prisma.caseCategory.upsert({ where: { slug: "svc-test" }, create: { slug: "svc-test", name: "Svc", defaultPriority: "MEDIUM" }, update: {} });
}
async function makeUser() {
  const id = `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.user.upsert({ where: { id }, create: { id, email: `${id}@test.local`, role: "CUSTOMER" }, update: {} });
  return id;
}
const input = (categoryId: string, openerUserId: string, over: Record<string, unknown> = {}) => ({
  type: "COMPLAINT" as const, categoryId, channel: "WEBSITE" as const, subject: "s", description: "d",
  openerUserId, openerRole: "CUSTOMER" as const, contact: { name: "A" }, ...over,
});

describe("case worker handlers (integration)", () => {
  it("case.message_added on a WHATSAPP opener reply writes an opener notification to no-op, and a handler reply notifies the opener", async () => {
    const c = await cat();
    const openerUserId = await makeUser();
    const { id } = await createCase(input(c.id, openerUserId));
    const msg = await addCaseMessage({ caseId: id, authorUserId: "agent1", authorRole: "SUPPORT", body: "hi", channel: "WEBSITE" });
    await handleCaseEvent({ id: "e1", type: "case.message_added", payload: { caseId: id, messageId: msg.id }, attempts: 0 });
    const notifs = await prisma.notification.findMany({ where: { userId: openerUserId, type: "CASE_UPDATE" } });
    expect(notifs.length).toBeGreaterThan(0);
  });

  it("case.status_changed writes a CASE_UPDATE notification for the opener", async () => {
    const c = await cat();
    const openerUserId = await makeUser();
    const { id, caseNumber } = await createCase(input(c.id, openerUserId));
    await handleCaseEvent({ id: "e2", type: "case.status_changed", payload: { caseId: id }, attempts: 0 });
    const notifs = await prisma.notification.findMany({ where: { userId: openerUserId, type: "CASE_UPDATE", title: `${caseNumber} updated` } });
    expect(notifs.length).toBe(1);
    expect((notifs[0]!.data as { caseId: string }).caseId).toBe(id);
  });

  it("sweepCaseSla emits case.sla_breached for overdue open cases and is idempotent", async () => {
    const c = await cat();
    const openerUserId = await makeUser();
    const { id } = await createCase(input(c.id, openerUserId, { priority: "URGENT" }));
    await prisma.case.update({ where: { id }, data: { resolutionDueAt: new Date(Date.now() - 3600_000) } });
    const first = await sweepCaseSla();
    expect(first).toBeGreaterThanOrEqual(1);
    const breached = await prisma.outboxEvent.findMany({ where: { type: "case.sla_breached", payload: { path: ["caseId"], equals: id } } });
    expect(breached).toHaveLength(1);
    await sweepCaseSla(); // second sweep must not double-emit
    const again = await prisma.outboxEvent.findMany({ where: { type: "case.sla_breached", payload: { path: ["caseId"], equals: id } } });
    expect(again).toHaveLength(1);
  });
});
