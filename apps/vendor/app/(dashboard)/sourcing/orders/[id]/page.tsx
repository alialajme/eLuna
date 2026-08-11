import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../../lib/auth";
import { getVendorByUserId } from "../../../../lib/vendor";
import { CancelOrderButton } from "../../../components/CancelOrderButton";

export const metadata: Metadata = { title: "Order — Luna Vendor" };

type Props = { params: Promise<{ id: string }> };

function label(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default async function MaterialOrderDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const order = await prisma.materialOrder
    .findUnique({
      where: { id },
      include: { items: true, supplier: { select: { companyName: true } } },
    })
    .catch(() => null);

  if (!order || order.vendorId !== vendor.id) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/sourcing/orders" className="text-body-sm text-mist hover:text-ink">← Back to orders</Link>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">Order</h2>
          <p className="text-body-sm text-mist">{order.supplier.companyName}</p>
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
          <p className="text-label text-mist mb-1">YOUR NOTE</p>
          <p className="text-body-sm text-ink">{order.note}</p>
        </div>
      )}
      {order.trackingNote && (
        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-label text-mist mb-1">SUPPLIER TRACKING</p>
          <p className="text-body-sm text-ink">{order.trackingNote}</p>
        </div>
      )}

      {order.status === "PENDING" && <CancelOrderButton orderId={order.id} />}
    </div>
  );
}
