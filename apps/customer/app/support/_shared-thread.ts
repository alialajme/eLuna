"use server";

import { addCaseMessage, prisma } from "@ayvana/db";
import { safeCurrentUser } from "../lib/auth";

export async function replyToOwnCase(
  caseId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!body.trim()) return { ok: false, error: "Empty" };
  const user = await safeCurrentUser();
  const c = await prisma.case
    .findUnique({ where: { id: caseId }, select: { openerUserId: true } })
    .catch(() => null);
  if (!c) return { ok: false, error: "Not found" };
  if (user && c.openerUserId && c.openerUserId !== user.id)
    return { ok: false, error: "Forbidden" };
  await addCaseMessage({
    caseId,
    authorUserId: user?.id ?? null,
    authorRole: "CUSTOMER",
    body: body.trim(),
    channel: "WEBSITE",
  });
  return { ok: true };
}
