import type { Prisma, CaseType, CaseChannel, CaseOpenerRole, CasePriority, CaseAuthorRole } from "@prisma/client";
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
