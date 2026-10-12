"use server";

import { createCase } from "@ayvana/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";

export type CaseSubmitResultShape = { ok: true; caseNumber: string } | { ok: false; error: string };

export async function submitVendorCase(data: {
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
  if (!user) return { ok: false, error: "Unauthorized" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { ok: false, error: "Vendor account not found" };
  const res = await createCase({
    type: data.type,
    categoryId: data.categoryId,
    channel: "WEBSITE",
    subject: data.subject,
    description: data.description,
    openerUserId: user.id,
    openerRole: "VENDOR",
    contact: { name: data.contactName, email: data.contactEmail || null },
    links: { vendorId: vendor.id, orderId: data.orderId ?? null },
  });
  return { ok: true, caseNumber: res.caseNumber };
}
