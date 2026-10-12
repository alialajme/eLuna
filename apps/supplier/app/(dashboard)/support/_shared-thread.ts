"use server";

import { addCaseMessage, prisma } from "@ayvana/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";

export async function replyToOwnCase(
  caseId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!body.trim()) return { ok: false, error: "Empty" };
  const user = await safeCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return { ok: false, error: "Supplier account not found" };
  const c = await prisma.case
    .findUnique({ where: { id: caseId }, select: { supplierId: true } })
    .catch(() => null);
  if (!c) return { ok: false, error: "Not found" };
  // Fail closed: strict ownership (a null supplierId link is not "yours").
  if (c.supplierId !== supplier.id) return { ok: false, error: "Forbidden" };
  await addCaseMessage({
    caseId,
    authorUserId: user.id,
    authorRole: "SUPPLIER",
    body: body.trim(),
    channel: "WEBSITE",
  });
  return { ok: true };
}
