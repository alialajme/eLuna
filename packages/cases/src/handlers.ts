import { prisma, applyCaseTriage, type OutboxRecord } from "@ayvana/db";
import { getMessagingGateway } from "@ayvana/messaging";
import { classifyCase } from "@ayvana/ai";

const OPEN_STATUSES = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER"] as const;
const HANDLER_ROLES = ["SUPPORT", "CALL_CENTER", "ADMIN"] as const;

async function notify(userId: string | null | undefined, title: string, body: string, caseId: string) {
  if (!userId) return;
  await prisma.notification.create({ data: { userId, type: "CASE_UPDATE", title, body, data: { caseId } } }).catch(() => null);
}

/** Idempotent outbox handler for case.* events. */
export async function handleCaseEvent(event: OutboxRecord): Promise<void> {
  const payload = (event.payload ?? {}) as { caseId?: string; messageId?: string };
  if (!payload.caseId) return;

  if (event.type === "case.created") {
    const c = await prisma.case.findUnique({ where: { id: payload.caseId }, select: { subject: true, description: true, suggestedCategoryId: true } });
    if (c && !c.suggestedCategoryId) {
      const cats = await prisma.caseCategory.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
      const suggestion = await classifyCase({ subject: c.subject, description: c.description, categorySlugs: cats.map((x) => x.slug) });
      if (suggestion) {
        const match = cats.find((x) => x.slug === suggestion.categorySlug);
        await applyCaseTriage(payload.caseId, { suggestedCategoryId: match?.id ?? null, suggestedPriority: suggestion.priority });
      }
    }
    return;
  }

  if (event.type === "case.message_added" && payload.messageId) {
    const msg = await prisma.caseMessage.findUnique({ where: { id: payload.messageId }, select: { authorRole: true, isInternal: true, body: true, channel: true } });
    const c = await prisma.case.findUnique({ where: { id: payload.caseId }, select: { openerUserId: true, contactPhone: true, caseNumber: true } });
    if (!msg || !c || msg.isInternal) return;

    // Handler → opener: in-app notification + (if the case came via WhatsApp) outbound WhatsApp.
    if ((HANDLER_ROLES as readonly string[]).includes(msg.authorRole)) {
      await notify(c.openerUserId, `Update on ${c.caseNumber}`, msg.body.slice(0, 160), payload.caseId);
      if (msg.channel === "WHATSAPP" && c.contactPhone) {
        await getMessagingGateway().sendMessage({ phone: c.contactPhone, text: msg.body });
      }
    }
    return;
  }

  if (event.type === "case.assigned") {
    const c = await prisma.case.findUnique({ where: { id: payload.caseId }, select: { openerUserId: true, caseNumber: true } });
    await notify(c?.openerUserId, `${c?.caseNumber} assigned`, "Your case is now being handled.", payload.caseId);
    return;
  }

  if (event.type === "case.resolved") {
    const c = await prisma.case.findUnique({ where: { id: payload.caseId }, select: { openerUserId: true, caseNumber: true } });
    await notify(c?.openerUserId, `${c?.caseNumber} resolved`, "Your case has been resolved.", payload.caseId);
    return;
  }
}

/**
 * Emit `case.sla_breached` once per overdue open case. Idempotent via an
 * ESCALATED CaseEvent marker: a case that already has one is skipped.
 */
export async function sweepCaseSla(now: Date = new Date()): Promise<number> {
  const overdue = await prisma.case.findMany({
    where: { status: { in: [...OPEN_STATUSES] }, resolutionDueAt: { lt: now } },
    select: { id: true },
  });
  let emitted = 0;
  for (const c of overdue) {
    const already = await prisma.caseEvent.findFirst({ where: { caseId: c.id, type: "ESCALATED" }, select: { id: true } });
    if (already) continue;
    await prisma.$transaction(async (tx) => {
      await tx.caseEvent.create({ data: { caseId: c.id, type: "ESCALATED", data: { reason: "sla_resolution_overdue" } } });
      await tx.outboxEvent.create({ data: { type: "case.sla_breached", payload: { caseId: c.id } } });
    });
    emitted++;
  }
  return emitted;
}
