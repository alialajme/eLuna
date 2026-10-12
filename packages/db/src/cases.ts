import type { Prisma, CaseType, CaseChannel, CaseOpenerRole, CasePriority, CaseAuthorRole, CaseStatus, CaseTeam } from "@prisma/client";
import { assertCaseTransition } from "./case-status";
import { prisma } from "./client";
import { appendOutboxEvent } from "./outbox";
import { caseSlaDueDates } from "./case-status";

type Tx = Prisma.TransactionClient;

export type CaseContact = { name: string; email?: string | null; phone?: string | null };
export type CaseLinks = {
  customerId?: string | null;
  vendorId?: string | null;
  supplierId?: string | null;
  orderId?: string | null;
  studioSessionId?: string | null;
};

export type CreateCaseInput = {
  type: CaseType;
  categoryId: string;
  channel: CaseChannel;
  subject: string;
  description: string;
  openerUserId?: string | null;
  openerRole: CaseOpenerRole;
  contact: CaseContact;
  priority?: CasePriority;
  links?: CaseLinks;
};

/** Human-friendly `CS-YYYY-NNNNN` number, scoped to the calendar year. */
async function nextCaseNumber(tx: Tx, year: number): Promise<string> {
  const count = await tx.case.count({ where: { caseNumber: { startsWith: `CS-${year}-` } } });
  return `CS-${year}-${String(count + 1).padStart(5, "0")}`;
}

/**
 * Create a case. Priority falls back to the category default. SLA due dates are
 * derived from the effective priority. The Case, a CREATED CaseEvent, and a
 * `case.created` outbox event are written in ONE transaction (so a committed
 * case always has its event; a rolled-back one leaves nothing behind).
 */
export async function createCase(input: CreateCaseInput): Promise<{ id: string; caseNumber: string }> {
  const category = await prisma.caseCategory.findUniqueOrThrow({ where: { id: input.categoryId } });
  const priority = input.priority ?? category.defaultPriority;
  const now = new Date();
  const sla = caseSlaDueDates(priority, now);

  return prisma.$transaction(async (tx) => {
    const caseNumber = await nextCaseNumber(tx, now.getFullYear());
    const created = await tx.case.create({
      data: {
        caseNumber,
        type: input.type,
        categoryId: input.categoryId,
        channel: input.channel,
        priority,
        subject: input.subject,
        description: input.description,
        openerUserId: input.openerUserId ?? null,
        openerRole: input.openerRole,
        contactName: input.contact.name,
        contactEmail: input.contact.email ?? null,
        contactPhone: input.contact.phone ?? null,
        customerId: input.links?.customerId ?? null,
        vendorId: input.links?.vendorId ?? null,
        supplierId: input.links?.supplierId ?? null,
        orderId: input.links?.orderId ?? null,
        studioSessionId: input.links?.studioSessionId ?? null,
        firstResponseDueAt: sla.firstResponseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
      },
      select: { id: true, caseNumber: true },
    });

    await tx.caseEvent.create({
      data: { caseId: created.id, actorUserId: input.openerUserId ?? null, type: "CREATED", data: { channel: input.channel } },
    });
    await appendOutboxEvent(tx, { type: "case.created", payload: { caseId: created.id } });

    return created;
  });
}

const HANDLER_ROLES: CaseAuthorRole[] = ["SUPPORT", "CALL_CENTER", "ADMIN"];

export type AddCaseMessageInput = {
  caseId: string;
  authorUserId?: string | null;
  authorRole: CaseAuthorRole;
  body: string;
  channel: CaseChannel;
  isInternal?: boolean;
  attachments?: Prisma.InputJsonValue;
  externalRef?: string | null;
};

/**
 * Append a message to a case. The first non-internal HANDLER reply stamps
 * `firstRespondedAt` (SLA metric). Message + MESSAGE event + outbox are atomic.
 */
export async function addCaseMessage(input: AddCaseMessageInput): Promise<{ id: string }> {
  const isHandlerResponse = !input.isInternal && HANDLER_ROLES.includes(input.authorRole);

  return prisma.$transaction(async (tx) => {
    const msg = await tx.caseMessage.create({
      data: {
        caseId: input.caseId,
        authorUserId: input.authorUserId ?? null,
        authorRole: input.authorRole,
        body: input.body,
        channel: input.channel,
        isInternal: input.isInternal ?? false,
        attachments: input.attachments ?? [],
        externalRef: input.externalRef ?? null,
      },
      select: { id: true },
    });

    if (isHandlerResponse) {
      await tx.case.updateMany({
        where: { id: input.caseId, firstRespondedAt: null },
        data: { firstRespondedAt: new Date() },
      });
    }

    await tx.caseEvent.create({
      data: { caseId: input.caseId, actorUserId: input.authorUserId ?? null, type: "MESSAGE", data: { messageId: msg.id, isInternal: input.isInternal ?? false } },
    });
    await appendOutboxEvent(tx, { type: "case.message_added", payload: { caseId: input.caseId, messageId: msg.id } });

    return msg;
  });
}

export async function assignCase(params: {
  caseId: string;
  assignedToUserId: string;
  assignedTeam?: CaseTeam | null;
  actorUserId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.case.findUniqueOrThrow({ where: { id: params.caseId }, select: { status: true } });
    const nextStatus: CaseStatus = current.status === "NEW" ? "ASSIGNED" : current.status;
    await tx.case.update({
      where: { id: params.caseId },
      data: { assignedToUserId: params.assignedToUserId, assignedTeam: params.assignedTeam ?? null, status: nextStatus },
    });
    await tx.caseEvent.create({
      data: { caseId: params.caseId, actorUserId: params.actorUserId, type: "ASSIGNED", data: { assignedToUserId: params.assignedToUserId, assignedTeam: params.assignedTeam ?? null } },
    });
    await appendOutboxEvent(tx, { type: "case.assigned", payload: { caseId: params.caseId, assignedToUserId: params.assignedToUserId } });
  });
}

/** Apply a validated status change. Throws CaseTransitionError on illegal moves. */
export async function transitionCase(params: {
  caseId: string;
  to: CaseStatus;
  actorUserId: string;
  reason?: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.case.findUniqueOrThrow({ where: { id: params.caseId }, select: { status: true } });
    assertCaseTransition(current.status, params.to);
    await tx.case.update({ where: { id: params.caseId }, data: { status: params.to } });
    await tx.caseEvent.create({
      data: { caseId: params.caseId, actorUserId: params.actorUserId, type: "STATUS_CHANGED", data: { from: current.status, to: params.to, reason: params.reason ?? null } },
    });
    await appendOutboxEvent(tx, { type: "case.status_changed", payload: { caseId: params.caseId, from: current.status, to: params.to } });
  });
}

export async function resolveCase(params: {
  caseId: string;
  actorUserId: string;
  relatedReturnId?: string | null;
  resolutionNote?: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.case.findUniqueOrThrow({ where: { id: params.caseId }, select: { status: true } });
    assertCaseTransition(current.status, "RESOLVED");
    await tx.case.update({
      where: { id: params.caseId },
      data: { status: "RESOLVED", resolvedAt: new Date(), relatedReturnId: params.relatedReturnId ?? undefined },
    });
    await tx.caseEvent.create({
      data: { caseId: params.caseId, actorUserId: params.actorUserId, type: "RESOLVED", data: { relatedReturnId: params.relatedReturnId ?? null, note: params.resolutionNote ?? null } },
    });
    await appendOutboxEvent(tx, { type: "case.resolved", payload: { caseId: params.caseId } });
  });
}

export async function reopenCase(params: { caseId: string; actorUserId: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.case.findUniqueOrThrow({ where: { id: params.caseId }, select: { status: true } });
    assertCaseTransition(current.status, "IN_PROGRESS");
    await tx.case.update({ where: { id: params.caseId }, data: { status: "IN_PROGRESS", resolvedAt: null, closedAt: null } });
    await tx.caseEvent.create({ data: { caseId: params.caseId, actorUserId: params.actorUserId, type: "REOPENED", data: { from: current.status } } });
    await appendOutboxEvent(tx, { type: "case.status_changed", payload: { caseId: params.caseId, from: current.status, to: "IN_PROGRESS" } });
  });
}

/** Store AI triage SUGGESTIONS (never auto-applies — a human confirms). */
export async function applyCaseTriage(
  caseId: string,
  s: { suggestedCategoryId?: string | null; suggestedPriority?: CasePriority | null },
): Promise<void> {
  await prisma.case.update({
    where: { id: caseId },
    data: { suggestedCategoryId: s.suggestedCategoryId ?? undefined, suggestedPriority: s.suggestedPriority ?? undefined },
  });
}

export type ListCasesFilter = {
  status?: CaseStatus;
  categoryId?: string;
  channel?: CaseChannel;
  assignedToUserId?: string;
  openerUserId?: string;
};

export function listCases(filter: ListCasesFilter = {}) {
  return prisma.case.findMany({
    where: {
      status: filter.status,
      categoryId: filter.categoryId,
      channel: filter.channel,
      assignedToUserId: filter.assignedToUserId,
      openerUserId: filter.openerUserId,
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: { category: { select: { name: true, slug: true } } },
    take: 200,
  });
}

export function getCaseDetail(caseId: string) {
  return prisma.case.findUnique({
    where: { id: caseId },
    include: {
      category: true,
      messages: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
}
