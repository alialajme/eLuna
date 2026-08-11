import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { TaxInvoiceDocument } from "@e-luna/ui";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";

export const metadata: Metadata = { title: "Tax Invoice — Luna Vendor" };

type Props = { params: Promise<{ id: string }> };
type Line = { description: string; quantity: number; unitPrice: number; lineTotal: number };

export default async function VendorInvoicePage({ params }: Props) {
  const { id } = await params;
  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const inv = await prisma.orderInvoice.findUnique({ where: { id } }).catch(() => null);
  if (!inv || inv.vendorId !== vendor.id) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/invoices" className="text-body-sm text-mist hover:text-ink print:hidden">← Back to invoices</Link>
      <TaxInvoiceDocument
        invoiceNumber={inv.invoiceNumber}
        issuedAt={inv.issuedAt.toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" })}
        seller={{ name: inv.vendorName, trn: inv.vendorTRN }}
        buyer={{ name: inv.customerName }}
        lines={(inv.lines as Line[]) ?? []}
        subtotal={Number(inv.subtotal)}
        vatAmount={Number(inv.vatAmount)}
        total={Number(inv.total)}
        externalRef={inv.externalRef}
      />
    </div>
  );
}
