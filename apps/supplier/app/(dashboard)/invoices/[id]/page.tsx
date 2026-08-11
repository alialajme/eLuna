import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getSupplierByUserId } from "../../../lib/supplier";
import { PrintButton } from "../../components/PrintButton";

export const metadata: Metadata = { title: "Tax Invoice — Luna Supplier" };

type Props = { params: Promise<{ id: string }> };
type Line = { name: string; unit: string; unitPrice: number; quantity: number; lineTotal: number };

const aed = (n: number) => `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) redirect("/");

  const inv = await prisma.materialInvoice.findUnique({ where: { id } }).catch(() => null);
  if (!inv || inv.supplierId !== supplier.id) notFound();

  const lines = (inv.lines as Line[]) ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/invoices" className="text-body-sm text-mist hover:text-ink">← Back to invoices</Link>
        <PrintButton />
      </div>

      <div className="rounded-2xl border border-sand bg-white p-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-display-md text-ink">Tax Invoice</p>
            <p className="text-body-sm text-mist">{inv.invoiceNumber}</p>
          </div>
          <div className="text-right text-body-sm">
            <p className="font-display text-display-sm text-gold">✦ Luna</p>
            <p className="text-mist">{inv.issuedAt.toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-y border-sand py-4 text-body-sm">
          <div>
            <p className="text-label text-mist mb-1">FROM</p>
            <p className="text-ink font-medium">{inv.supplierName}</p>
            <p className="text-mist">TRN: {inv.supplierTRN}</p>
          </div>
          <div>
            <p className="text-label text-mist mb-1">BILL TO</p>
            <p className="text-ink font-medium">{inv.vendorName}</p>
          </div>
        </div>

        <table className="w-full text-body-sm">
          <thead>
            <tr className="border-b border-sand text-body-xs uppercase tracking-wide text-mist">
              <th className="py-2 text-left font-medium">Item</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Unit price</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-sand/60">
                <td className="py-2 text-ink">{l.name}</td>
                <td className="py-2 text-right text-mist">{l.quantity} {l.unit.toLowerCase()}</td>
                <td className="py-2 text-right text-mist">{aed(l.unitPrice)}</td>
                <td className="py-2 text-right text-ink">{aed(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto w-56 space-y-1 text-body-sm">
          <div className="flex justify-between"><span className="text-mist">Net</span><span className="text-ink">{aed(Number(inv.subtotal))}</span></div>
          <div className="flex justify-between"><span className="text-mist">VAT (5%)</span><span className="text-ink">{aed(Number(inv.vatAmount))}</span></div>
          <div className="flex justify-between border-t border-sand pt-1 font-medium">
            <span className="text-ink">Total</span><span className="text-ink">{aed(Number(inv.total))}</span>
          </div>
        </div>

        {inv.externalRef && (
          <p className="text-body-xs text-mist">FTA / Peppol reference: {inv.externalRef}</p>
        )}
      </div>
    </div>
  );
}
