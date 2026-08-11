import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { courierName, trackingUrl } from "@e-luna/ui/couriers";
import { safeCurrentUser } from "../../../lib/auth";
import { getSupplierByUserId } from "../../../lib/supplier";
import { OrderActions } from "../../components/OrderActions";
import { IssueInvoiceButton } from "../../components/IssueInvoiceButton";

export const metadata: Metadata = { title: "Order — Luna Supplier" };

type Props = { params: Promise<{ id: string }> };

function label(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default async function IncomingOrderDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) redirect("/");

  const order = await prisma.materialOrder
    .findUnique({
      where: { id },
      include: { items: true, vendor: { select: { storeName: true } }, invoice: { select: { id: true } } },
    })
    .catch(() => null);

  if (!order || order.supplierId !== supplier.id) notFound();

  const trnRecord = await prisma.supplier
    .findUnique({ where: { id: supplier.id }, select: { trn: true } })
    .catch(() => null);
  const canInvoice = ["ACCEPTED", "SHIPPED", "COMPLETED"].includes(order.status);

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/orders" className="text-body-sm text-mist hover:text-ink">← Back to orders</Link>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">Order</h2>
          <p className="text-body-sm text-mist">From {order.vendor.storeName}</p>
        </div>
        <span className="rounded-full bg-sand px-3 py-1 text-body-sm font-medium text-ink">{label(order.status)}</span>
      </div>

      <div className="rounded-2xl border border-sand bg-ivory p-5 space-y-3">
        {order.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between">
            <div>
              <p className="text-body-md text-ink">{it.materialName}</p>
              <p className="text-body-xs text-mist">
                {it.quantity} {it.unit.toLowerCase()} × AED {Number(it.unitPrice).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <p className="text-body-sm text-ink">
              AED {(Number(it.unitPrice) * it.quantity).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
            </p>
          </div>
        ))}
        <div className="border-t border-sand pt-3 flex items-center justify-between">
          <span className="text-body-sm font-medium text-ink">Total</span>
          <span className="font-display text-display-sm text-ink">
            AED {Number(order.total).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {order.note && (
        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-label text-mist mb-1">VENDOR NOTE</p>
          <p className="text-body-sm text-ink">{order.note}</p>
        </div>
      )}
      {order.courier && (
        <div className="rounded-2xl border border-sand bg-ivory p-5 space-y-1">
          <p className="text-label text-mist mb-1">SHIPMENT</p>
          <p className="text-body-sm text-ink">{courierName(order.courier)}</p>
          {order.trackingNumber &&
            (trackingUrl(order.courier, order.trackingNumber) ? (
              <a href={trackingUrl(order.courier, order.trackingNumber)!} target="_blank" rel="noopener noreferrer"
                className="text-body-sm text-gold hover:underline">
                Track {order.trackingNumber} →
              </a>
            ) : (
              <p className="text-body-sm text-mist">{order.trackingNumber}</p>
            ))}
          {order.labelUrl && (
            <a href={order.labelUrl} target="_blank" rel="noopener noreferrer" className="block text-body-sm text-gold hover:underline">
              Print label →
            </a>
          )}
          {order.trackingNote && <p className="text-body-sm text-ink">{order.trackingNote}</p>}
        </div>
      )}
      {!order.courier && order.trackingNote && (
        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-label text-mist mb-1">TRACKING</p>
          <p className="text-body-sm text-ink">{order.trackingNote}</p>
        </div>
      )}

      {order.invoice ? (
        <Link
          href={`/invoices/${order.invoice.id}`}
          className="inline-flex rounded-full border border-sand px-5 py-2.5 text-body-sm text-ink hover:border-ink transition-colors"
        >
          View tax invoice →
        </Link>
      ) : canInvoice ? (
        <IssueInvoiceButton orderId={order.id} hasTrn={!!trnRecord?.trn} />
      ) : null}

      <OrderActions orderId={order.id} status={order.status} />
    </div>
  );
}
