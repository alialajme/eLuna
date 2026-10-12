"use server";

import { createCase } from "@ayvana/db";
import { prisma } from "@ayvana/db";
import { safeCurrentUser } from "../lib/auth";

export type CaseSubmitResultShape = { ok: true; caseNumber: string } | { ok: false; error: string };

export async function submitCustomerCase(data: {
  type: "COMPLAINT" | "SUGGESTION" | "QUESTION";
  categoryId: string;
  subject: string;
  description: string;
  contactName: string;
  contactEmail: string;
  orderId?: string;
}): Promise<CaseSubmitResultShape> {
  if (!data.subject.trim() || !data.description.trim())
    return { ok: false, error: "Subject and description are required" };
  const user = await safeCurrentUser();
  let customerId: string | null = null;
  if (user) {
    const prof = await prisma.customerProfile
      .findUnique({ where: { userId: user.id }, select: { id: true } })
      .catch(() => null);
    customerId = prof?.id ?? null;
  }
  const res = await createCase({
    type: data.type,
    categoryId: data.categoryId,
    channel: "WEBSITE",
    subject: data.subject,
    description: data.description,
    openerUserId: user?.id ?? null,
    openerRole: "CUSTOMER",
    contact: { name: data.contactName, email: data.contactEmail || null },
    links: { customerId, orderId: data.orderId ?? null },
  });
  return { ok: true, caseNumber: res.caseNumber };
}
