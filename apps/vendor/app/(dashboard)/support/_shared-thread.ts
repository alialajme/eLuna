"use server";

import { addCaseMessage, prisma } from "@ayvana/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";

export async function replyToOwnCase(
  caseId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!body.trim()) return { ok: false, error: "Empty" };
  const user = await safeCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { ok: false, error: "Vendor account not found" };
  const c = await prisma.case
    .findUnique({ where: { id: caseId }, select: { vendorId: true } })
    .catch(() => null);
  if (!c) return { ok: false, error: "Not found" };
  if (c.vendorId && c.vendorId !== vendor.id) return { ok: false, error: "Forbidden" };
  await addCaseMessage({
    caseId,
    authorUserId: user.id,
    authorRole: "VENDOR",
    body: body.trim(),
    channel: "WEBSITE",
  });
  return { ok: true };
}
