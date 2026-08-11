"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { getEInvoiceGateway } from "@e-luna/einvoice";
import { safeCurrentUser } from "../lib/auth";

type ActiveVendor = { id: string; storeName: string; storeSlug: string; trn: string | null };

async function resolveActiveVendor(): Promise<{ vendor: ActiveVendor } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const vendor = await prisma.vendor
    .findUnique({
      where: { userId: user.id },
      select: { id: true, storeName: true, storeSlug: true, status: true, trn: true },
    })
    .catch(() => null);
  if (!vendor) return { error: "Vendor not found" };
  if (vendor.status !== "ACTIVE") return { error: "Your vendor account is not active" };
  return { vendor: { id: vendor.id, storeName: vendor.storeName, storeSlug: vendor.storeSlug, trn: vendor.trn } };
}

export async function setVendorTrn(trn: string): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveVendor();
  if ("error" in auth) return { success: false, error: auth.error };
  const clean = trn.trim();
  if (!/^\d{15}$/.test(clean)) return { success: false, error: "TRN must be 15 digits" };
  try {
    await prisma.vendor.update({ where: { id: auth.vendor.id }, data: { trn: clean } });
    revalidatePath("/settings");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to save TRN" };
  }
}

const INVOICEABLE = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

export async function issueOrderInvoice(
  orderId: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await resolveActiveVendor();
  if ("error" in auth) return { success: false, error: auth.error };
  const vendor = auth.vendor;
  if (!vendor.trn) return { success: false, error: "Set your TRN in Settings before issuing invoices" };

  const order = await prisma.order
    .findUnique({
      where: { id: orderId },
      select: {
        status: true,
        address: { select: { fullName: true } },
        items: {
          where: { vendorId: vendor.id },
          select: { quantity: true, unitPrice: true, variant: { select: { product: { select: { title: true } } } } },
        },
        invoices: { where: { vendorId: vendor.id }, select: { id: true } },
      },
    })
    .catch(() => null);
  if (!order) return { success: false, error: "Not found" };
  if (order.items.length === 0) return { success: false, error: "You have no items in this order" };
  if (!INVOICEABLE.includes(order.status)) return { success: false, error: "The order is not confirmed yet" };
  if (order.invoices.length > 0) return { success: false, error: "You have already invoiced this order" };

  const lines = order.items.map((it) => {
    const unitPrice = Number(it.unitPrice);
    return {
      description: it.variant.product.title,
      quantity: it.quantity,
      unitPrice,
      lineTotal: Math.round(unitPrice * it.quantity * 100) / 100,
    };
  });
  // Retail prices are VAT-inclusive → back-compute.
  const gross = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  const vatRate = 0.05;
  const net = Math.round((gross / (1 + vatRate)) * 100) / 100;
  const vatAmount = Math.round((gross - net) * 100) / 100;
  const total = gross;
  const customerName = order.address.fullName;

  const prefix = vendor.storeSlug.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "INV";
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  for (let attempt = 0; attempt < 2; attempt++) {
    const count = await prisma.orderInvoice
      .count({ where: { vendorId: vendor.id, issuedAt: { gte: yearStart, lt: yearEnd } } })
      .catch(() => 0);
    const invoiceNumber = `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;

    const result = await getEInvoiceGateway().issue({
      invoiceNumber,
      seller: { name: vendor.storeName, trn: vendor.trn },
      buyer: { name: customerName },
      subtotal: net, vatRate, vatAmount, total,
      lines,
    });
    if (result.status === "failed") return { success: false, error: result.error };

    try {
      const inv = await prisma.orderInvoice.create({
        data: {
          invoiceNumber,
          orderId,
          vendorId: vendor.id,
          vendorName: vendor.storeName,
          vendorTRN: vendor.trn,
          customerName,
          subtotal: net, vatRate, vatAmount, total,
          lines,
          externalRef: result.externalRef,
        },
        select: { id: true },
      });
      revalidatePath("/invoices");
      revalidatePath(`/orders/${orderId}`);
      return { success: true, id: inv.id };
    } catch (err) {
      const pErr = err as { code?: string; meta?: { target?: string[] | string } };
      // Prisma's P2002 `meta.target` is version/DB-dependent: a field-name array
      // (["orderId","vendorId"]) or the constraint name ("OrderInvoice_orderId_vendorId_key").
      // Normalise to a string and substring-match both so either shape is handled.
      const rawTarget = pErr.meta?.target;
      const targetStr = Array.isArray(rawTarget) ? rawTarget.join(",") : String(rawTarget ?? "");
      // (orderId, vendorId) unique → already invoiced; invoiceNumber unique → recompute once.
      if (pErr.code === "P2002" && targetStr.includes("orderId") && targetStr.includes("vendorId")) {
        return { success: false, error: "You have already invoiced this order" };
      }
      if (pErr.code === "P2002" && attempt === 0) continue;
      return { success: false, error: "Failed to issue invoice" };
    }
  }
  return { success: false, error: "Failed to issue invoice" };
}
