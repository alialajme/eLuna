import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";

type Props = { params: Promise<{ id: string }> };

const ORDER_STATUS_BADGE: Record<string, string> = {
  DELIVERED: "bg-sage/20 text-sage",
  CONFIRMED: "bg-gold/20 text-gold",
  PROCESSING: "bg-gold/20 text-gold",
  SHIPPED: "bg-gold/20 text-gold",
  PENDING: "bg-sand text-mist",
  CANCELLED: "bg-coral/20 text-coral",
  REFUNDED: "bg-coral/20 text-coral",
};

const PAYMENT_LABELS: Record<string, string> = {
  CARD: "Card",
  LUNA_WALLET: "Luna Wallet",
  TABBY: "Tabby",
  TAMARA: "Tamara",
  CASH_ON_DELIVERY: "Cash on Delivery",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order #${id.slice(-8).toUpperCase()} — Luna Ops` };
}

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const order = await prisma.order
    .findUnique({
      where: { id },
      include: {
        address: true,
        customer: { include: { user: { select: { email: true } } } },
        items: {
          include: {
            variant: {
              include: {
                product: {
                  select: { title: true, vendor: { select: { storeName: true } } },
                },
              },
            },
          },
        },
        shipments: true,
      },
    })
    .catch(() => null);

  if (!order) redirect("/orders");

  const vendorTotals = new Map<string, number>();
  for (const item of order.items) {
    const vendorName = item.variant.product.vendor.storeName;
    const line = Number(item.unitPrice) * item.quantity;
    vendorTotals.set(vendorName, (vendorTotals.get(vendorName) ?? 0) + line);
  }

  const statusLabel =
    order.status.charAt(0) + order.status.slice(1).toLowerCase();

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-display-md text-ink">
            Order #{order.id.slice(-8).toUpperCase()}
          </h2>
          <p className="mt-1 text-body-xs text-mist">
            Placed{" "}
            {new Date(order.createdAt).toLocaleDateString("en-AE", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}{" "}
            · {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-body-sm font-medium ${ORDER_STATUS_BADGE[order.status] ?? "bg-sand text-mist"}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left: items + per-vendor breakdown */}
        <div className="space-y-5">
          <div className="rounded-lg border border-sand bg-white p-5">
            <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
              Items
            </p>
            <div className="flex flex-col gap-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-body-sm text-ink">
                      {item.variant.product.title}
                    </p>
                    <p className="text-body-xs text-mist">
                      {item.variant.product.vendor.storeName} · {item.variant.size} /{" "}
                      {item.variant.color}
                    </p>
                  </div>
                  <p className="shrink-0 text-body-xs text-mist">×{item.quantity}</p>
                  <p className="shrink-0 text-body-sm text-ink">
                    {fmtAED(Number(item.unitPrice) * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-sand bg-white p-5">
            <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
              Per-vendor breakdown
            </p>
            <div className="flex flex-col gap-2">
              {[...vendorTotals.entries()].map(([vendorName, subtotal]) => (
                <div key={vendorName} className="flex items-center justify-between">
                  <p className="text-body-sm text-ink">{vendorName}</p>
                  <p className="text-body-sm text-mist">{fmtAED(subtotal)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: customer, address, totals, shipments */}
        <div className="space-y-5">
          <div className="rounded-lg border border-sand bg-white p-5">
            <p className="mb-2 text-body-xs font-medium uppercase tracking-wide text-mist">
              Customer
            </p>
            <p className="text-body-sm text-ink">{order.address.fullName}</p>
            <p className="text-body-xs text-mist">{order.customer.user.email}</p>
            <p className="text-body-xs text-mist">{order.address.phone}</p>
          </div>

          <div className="rounded-lg border border-sand bg-white p-5">
            <p className="mb-2 text-body-xs font-medium uppercase tracking-wide text-mist">
              Shipping address
            </p>
            <p className="text-body-sm text-ink">{order.address.addressLine1}</p>
            {order.address.addressLine2 && (
              <p className="text-body-sm text-ink">{order.address.addressLine2}</p>
            )}
            <p className="text-body-sm text-ink">
              {order.address.city}
              {order.address.emirate ? `, ${order.address.emirate}` : ""}
            </p>
            <p className="text-body-xs text-mist">{order.address.country}</p>
          </div>

          <div className="rounded-lg border border-sand bg-white p-5">
            <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
              Totals
            </p>
            <div className="flex flex-col gap-1.5 text-body-sm">
              <div className="flex justify-between">
                <span className="text-mist">Subtotal</span>
                <span className="text-ink">{fmtAED(Number(order.subtotal))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mist">Discount</span>
                <span className="text-ink">{fmtAED(Number(order.discount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mist">Shipping</span>
                <span className="text-ink">{fmtAED(Number(order.shippingFee))}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-sand pt-2 font-medium">
                <span className="text-ink">Total</span>
                <span className="text-ink">{fmtAED(Number(order.total))}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-sand bg-white p-5">
            <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
              Shipments
            </p>
            {order.shipments.length === 0 ? (
              <p className="text-body-sm text-mist">No shipments yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {order.shipments.map((s) => (
                  <div key={s.id} className="text-body-sm">
                    <p className="text-ink">{s.courier}</p>
                    <p className="text-body-xs text-mist">
                      {s.trackingNumber ?? "—"} ·{" "}
                      {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                    </p>
                    {s.estimatedDelivery && (
                      <p className="text-body-xs text-mist">
                        Est.{" "}
                        {new Date(s.estimatedDelivery).toLocaleDateString("en-AE", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
