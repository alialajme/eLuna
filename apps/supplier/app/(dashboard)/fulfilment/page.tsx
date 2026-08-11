import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { courierName, trackingUrl } from "@e-luna/ui/couriers";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";
import { ShipGroup, DeliverButton } from "./FulfilmentActions";

export const metadata: Metadata = { title: "Customer Orders — Luna Supplier" };

type Address = { fullName: string; addressLine1: string; city: string; emirate: string | null };
type Line = { id: string; title: string; size: string; color: string; quantity: number };
type Group = {
  orderId: string;
  vendorId: string;
  vendorName: string;
  createdAt: Date;
  address: Address;
  lines: Line[];
};

export default async function FulfilmentPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) redirect("/");

  // To-ship: unshipped dropship items for this supplier on paid orders, grouped by (order, vendor).
  const items = await prisma.orderItem
    .findMany({
      where: {
        fulfillmentStatus: { in: ["PENDING", "PROCESSING"] },
        shipmentId: null,
        order: { status: { in: ["CONFIRMED", "PROCESSING"] } },
        variant: { product: { dropshipSupplierId: supplier.id } },
      },
      select: {
        id: true,
        quantity: true,
        orderId: true,
        vendorId: true,
        variant: { select: { size: true, color: true, product: { select: { title: true } } } },
        order: {
          select: {
            createdAt: true,
            address: { select: { fullName: true, addressLine1: true, city: true, emirate: true } },
          },
        },
        vendor: { select: { storeName: true } },
      },
      orderBy: { order: { createdAt: "asc" } },
    })
    .catch(() => []);

  const groups = new Map<string, Group>();
  for (const it of items) {
    const key = `${it.orderId}:${it.vendorId}`;
    const g =
      groups.get(key) ??
      {
        orderId: it.orderId,
        vendorId: it.vendorId,
        vendorName: it.vendor.storeName,
        createdAt: it.order.createdAt,
        address: it.order.address,
        lines: [],
      };
    g.lines.push({
      id: it.id,
      title: it.variant.product.title,
      size: it.variant.size,
      color: it.variant.color,
      quantity: it.quantity,
    });
    groups.set(key, g);
  }

  const shipments = await prisma.shipment
    .findMany({
      where: { supplierId: supplier.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, courier: true, trackingNumber: true, status: true, orderId: true },
    })
    .catch(() => []);

  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="max-w-3xl space-y-8">
      <h2 className="font-display text-display-md text-ink">Customer Orders</h2>

      <section className="space-y-4">
        <p className="text-label text-mist">TO SHIP</p>
        {groups.size === 0 ? (
          <div className="rounded-2xl border border-dashed border-sand bg-ivory py-12 text-center">
            <p className="text-body-md text-ink">Nothing to fulfil</p>
            <p className="text-body-sm text-mist mt-1">Dropship orders assigned to you appear here.</p>
          </div>
        ) : (
          [...groups.values()].map((g) => (
            <div key={`${g.orderId}:${g.vendorId}`} className="rounded-2xl border border-sand bg-ivory p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-body-md font-medium text-ink">Order #{g.orderId.slice(-8).toUpperCase()}</p>
                <p className="text-body-xs text-mist">{fmt(g.createdAt)} · for {g.vendorName}</p>
              </div>
              <div className="text-body-sm text-mist">
                <p className="text-ink">Ship to: {g.address.fullName}</p>
                <p>
                  {g.address.addressLine1}, {g.address.city}
                  {g.address.emirate ? `, ${g.address.emirate}` : ""}, UAE
                </p>
              </div>
              <ul className="text-body-sm text-ink border-t border-sand pt-2">
                {g.lines.map((l) => (
                  <li key={l.id} className="flex justify-between py-0.5">
                    <span>{l.title} · {l.size}/{l.color}</span>
                    <span className="text-mist">×{l.quantity}</span>
                  </li>
                ))}
              </ul>
              <ShipGroup orderId={g.orderId} vendorId={g.vendorId} />
            </div>
          ))
        )}
      </section>

      {shipments.length > 0 && (
        <section className="space-y-3">
          <p className="text-label text-mist">SHIPPED</p>
          {shipments.map((s) => {
            const url = s.trackingNumber ? trackingUrl(s.courier, s.trackingNumber) : null;
            return (
              <div key={s.id} className="rounded-2xl border border-sand bg-ivory p-5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-ink">Order #{s.orderId.slice(-8).toUpperCase()}</p>
                  <p className="text-body-xs text-mist">
                    {courierName(s.courier)}
                    {s.trackingNumber ? (
                      url ? (
                        <>
                          {" · "}
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                            {s.trackingNumber}
                          </a>
                        </>
                      ) : (
                        ` · ${s.trackingNumber}`
                      )
                    ) : (
                      ""
                    )}
                    {" · "}
                    {s.status.replace(/_/g, " ").toLowerCase()}
                  </p>
                </div>
                {s.status !== "DELIVERED" && <DeliverButton shipmentId={s.id} />}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
