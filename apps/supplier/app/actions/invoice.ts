"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getEInvoiceGateway } from "../lib/einvoice/factory";

type ActiveSupplier = {
  id: string;
  companyName: string;
  companySlug: string;
  trn: string | null;
};

async function resolveActiveSupplier(): Promise<{ supplier: ActiveSupplier } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supplier = await prisma.supplier
    .findUnique({
      where: { userId: user.id },
      select: { id: true, companyName: true, companySlug: true, status: true, trn: true },
    })
    .catch(() => null);
  if (!supplier) return { error: "Not a supplier" };
  if (supplier.status !== "ACTIVE") return { error: "Your supplier account is not active" };
  return { supplier: { id: supplier.id, companyName: supplier.companyName, companySlug: supplier.companySlug, trn: supplier.trn } };
}

export async function setSupplierTrn(trn: string): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };
  const clean = trn.trim();
  if (!/^\d{15}$/.test(clean)) return { success: false, error: "TRN must be 15 digits" };
  try {
    await prisma.supplier.update({ where: { id: auth.supplier.id }, data: { trn: clean } });
    revalidatePath("/settings");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to save TRN" };
  }
}

const INVOICEABLE = ["ACCEPTED", "SHIPPED", "COMPLETED"];

export async function issueMaterialInvoice(
  orderId: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };
  const supplier = auth.supplier;
  if (!supplier.trn) return { success: false, error: "Set your TRN in Settings before issuing invoices" };

  const order = await prisma.materialOrder
    .findUnique({
      where: { id: orderId },
      include: { items: true, vendor: { select: { storeName: true } }, invoice: { select: { id: true } } },
    })
    .catch(() => null);
  if (!order || order.supplierId !== supplier.id) return { success: false, error: "Not found" };
  if (!INVOICEABLE.includes(order.status)) {
    return { success: false, error: "The order must be accepted before you can invoice it" };
  }
  if (order.invoice) return { success: false, error: "This order already has an invoice" };

  const subtotal = Number(order.total);
  const vatRate = 0.05;
  const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;
  const lines = order.items.map((it) => ({
    name: it.materialName,
    unit: it.unit,
    unitPrice: Number(it.unitPrice),
    quantity: it.quantity,
    lineTotal: Math.round(Number(it.unitPrice) * it.quantity * 100) / 100,
  }));

  const prefix = supplier.companySlug.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "INV";
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // Two attempts: recompute the sequential number on an invoiceNumber race (P2002).
  for (let attempt = 0; attempt < 2; attempt++) {
    const count = await prisma.materialInvoice
      .count({ where: { supplierId: supplier.id, issuedAt: { gte: yearStart, lt: yearEnd } } })
      .catch(() => 0);
    const invoiceNumber = `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;

    const result = await getEInvoiceGateway().issue({
      invoiceNumber,
      supplier: { name: supplier.companyName, trn: supplier.trn },
      vendor: { name: order.vendor.storeName },
      subtotal, vatRate, vatAmount, total, lines,
    });
    if (result.status === "failed") return { success: false, error: result.error };

    try {
      const inv = await prisma.materialInvoice.create({
        data: {
          invoiceNumber,
          materialOrderId: order.id,
          supplierId: supplier.id,
          vendorId: order.vendorId,
          supplierName: supplier.companyName,
          supplierTRN: supplier.trn,
          vendorName: order.vendor.storeName,
          subtotal, vatRate, vatAmount, total,
          lines,
          externalRef: result.externalRef,
        },
        select: { id: true },
      });
      revalidatePath("/invoices");
      revalidatePath(`/orders/${orderId}`);
      return { success: true, id: inv.id };
    } catch (err) {
      const pErr = err as { code?: string; meta?: { target?: string[] } };
      const target = pErr.meta?.target ?? [];
      // materialOrderId unique → the order was already invoiced (lost a race): the correct error,
      // not a retry (a retry would re-call the gateway for an invoice that can't be persisted).
      if (pErr.code === "P2002" && target.includes("materialOrderId")) {
        return { success: false, error: "This order already has an invoice" };
      }
      // invoiceNumber unique → a concurrent invoice took our number: recompute once.
      if (pErr.code === "P2002" && attempt === 0) continue;
      return { success: false, error: "Failed to issue invoice" };
    }
  }
  return { success: false, error: "Failed to issue invoice" };
}
