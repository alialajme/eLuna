import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";

export const metadata: Metadata = { title: "Invoices — Luna Supplier" };

export default async function InvoicesPage() {
  const user = await safeCurrentUser();
  if (!user) return null;
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return null;

  const invoices = await prisma.materialInvoice
    .findMany({ where: { supplierId: supplier.id }, orderBy: { issuedAt: "desc" } })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Invoices</h2>

      {invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-ivory py-16 text-center">
          <p className="text-body-md text-ink">No invoices yet</p>
          <p className="text-body-sm text-mist mt-1">Issue a tax invoice from an accepted order.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {invoices.map((inv) => (
            <Link key={inv.id} href={`/invoices/${inv.id}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-sand bg-ivory p-5 hover:border-ink transition-colors">
              <div className="min-w-0">
                <p className="text-body-md font-medium text-ink">{inv.invoiceNumber}</p>
                <p className="text-body-xs text-mist">
                  {inv.vendorName} · {inv.issuedAt.toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <p className="text-body-sm text-ink">
                AED {Number(inv.total).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                <span className="text-mist"> incl. VAT</span>
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
