"use server";

import { createCase } from "@ayvana/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";

export type CaseSubmitResultShape = { ok: true; caseNumber: string } | { ok: false; error: string };

export async function submitSupplierCase(data: {
  type: "COMPLAINT" | "SUGGESTION" | "QUESTION";
  categoryId: string;
  subject: string;
  description: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  orderId?: string;
}): Promise<CaseSubmitResultShape> {
  if (!data.subject.trim() || !data.description.trim())
    return { ok: false, error: "Subject and description are required" };
  const user = await safeCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return { ok: false, error: "Supplier account not found" };
  const res = await createCase({
    type: data.type,
    categoryId: data.categoryId,
    channel: "WEBSITE",
    subject: data.subject,
    description: data.description,
    openerUserId: user.id,
    openerRole: "SUPPLIER",
    contact: { name: data.contactName, email: data.contactEmail || null, phone: data.contactPhone || null },
    links: { supplierId: supplier.id },
  });
  return { ok: true, caseNumber: res.caseNumber };
}
