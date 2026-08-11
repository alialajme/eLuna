import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { TaxInvoiceDocument } from "@e-luna/ui";
import { safeCurrentUser } from "../../../../lib/auth";

export const metadata: Metadata = { title: "Tax Invoice — Luna" };

type Props = { params: Promise<{ id: string; invoiceId: string }> };
type Line = { description: string; quantity: number; unitPrice: number; lineTotal: number };

export default async function CustomerInvoicePage({ params }: Props) {
  const { id, invoiceId } = await params;
  const user = await safeCurrentUser();
  if (!user) redirect("/sign-in");

  const profile = await prisma.customerProfile
    .findUnique({ where: { userId: user.id }, select: { id: true } })
    .catch(() => null);
  if (!profile) notFound();

  const inv = await prisma.orderInvoice
    .findUnique({ where: { id: invoiceId }, include: { order: { select: { id: true, customerId: true } } } })
    .catch(() => null);
  // The invoice must belong to this order AND this customer's order.
  if (!inv || inv.orderId !== id || inv.order.customerId !== profile.id) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-6 space-y-6">
      <Link href={`/orders/${id}`} className="text-body-sm text-mist hover:text-ink print:hidden">← Back to order</Link>
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
