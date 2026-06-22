import { notFound } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order #${id.slice(-8).toUpperCase()} — Luna` };
}

const SHIPMENT_STAGES = [
  "CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

export default async function OrderDetailPage({ params }: Props) {
  const [{ id }, user] = await Promise.all([params, safeCurrentUser()]);

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="font-display text-display-md text-ink mb-4">Sign in to view your order</p>
        <a
          href="/sign-in"
          className="inline-flex rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory"
        >
          Sign in
        </a>
      </div>
    );
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: { select: { title: true, slug: true, aiImages: true } },
            },
          },
        },
      },
      address: true,
      shipments: { orderBy: { createdAt: "desc" }, take: 1 },
      paymentTransactions: { take: 1 },
    },
  }).catch(() => null);

  if (!order) notFound();

  // Fail closed: verify ownership unconditionally
  const profile = await prisma.customerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile || order.customerId !== profile.id) notFound();

  const shipment = order.shipments[0] ?? null;
  const paymentTx = order.paymentTransactions[0] ?? null;

  const currentStageIndex = shipment
    ? SHIPMENT_STAGES.indexOf(
        shipment.status as (typeof SHIPMENT_STAGES)[number]
      )
    : -1;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <nav className="flex items-center gap-2 text-body-sm text-mist mb-1">
            <Link href="/orders" className="hover:text-gold transition-colors">
              Orders
            </Link>
            <span>/</span>
            <span className="text-ink">#{order.id.slice(-8).toUpperCase()}</span>
          </nav>
          <h1 className="font-display text-display-md text-ink">
            Order #{order.id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-body-sm text-mist">
            {new Date(order.createdAt).toLocaleDateString("en-AE", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <span
          className={`rounded-full px-4 py-2 text-label uppercase font-semibold ${
            ["SHIPPED", "DELIVERED"].includes(order.status)
              ? "bg-sage/20 text-sage"
              : order.status === "CANCELLED"
              ? "bg-coral/20 text-coral"
              : "bg-gold/20 text-gold"
          }`}
        >
          {order.status}
        </span>
      </div>

      {/* Shipment timeline */}
      {shipment && (
        <div className="rounded-2xl border border-sand bg-ivory p-6">
          <h2 className="font-display text-display-sm text-ink mb-4">Tracking</h2>
          {shipment.trackingNumber && (
            <p className="text-body-sm text-mist mb-4">
              {shipment.courier} · {shipment.trackingNumber}
            </p>
          )}
          <div className="flex items-start">
            {SHIPMENT_STAGES.map((stage, idx) => (
              <div key={stage} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  <div
                    className={`h-3 w-3 shrink-0 rounded-full ${
                      idx <= currentStageIndex ? "bg-ink" : "bg-sand"
                    }`}
                  />
                  {idx < SHIPMENT_STAGES.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 ${
                        idx < currentStageIndex ? "bg-ink" : "bg-sand"
                      }`}
                    />
                  )}
                </div>
                <p
                  className={`mt-1 text-body-xs text-center ${
                    idx <= currentStageIndex ? "text-ink" : "text-mist"
                  }`}
                >
                  {stage.replace(/_/g, " ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="rounded-2xl border border-sand bg-ivory p-6">
        <h2 className="font-display text-display-sm text-ink mb-4">Items</h2>
        <ul className="divide-y divide-sand">
          {order.items.map((item) => {
            const images = Array.isArray(item.variant.product.aiImages)
              ? (item.variant.product.aiImages as string[])
              : [];
            return (
              <li key={item.id} className="flex gap-4 py-4">
                <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-sand/40">
                  {images[0] ? (
                    <img
                      src={images[0]}
                      alt={item.variant.product.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full bg-sand" />
                  )}
                </div>
                <div className="flex-1">
                  <Link
                    href={`/p/${item.variant.product.slug}`}
                    className="text-body-md font-medium text-ink hover:text-gold transition-colors"
                  >
                    {item.variant.product.title}
                  </Link>
                  <p className="text-body-sm text-mist">
                    {item.variant.size} · {item.variant.color}
                  </p>
                  <p className="text-body-sm text-mist">Qty: {item.quantity}</p>
                </div>
                <p className="font-display text-body-md text-gold whitespace-nowrap">
                  AED{" "}
                  {(Number(item.unitPrice) * item.quantity).toLocaleString(
                    "en-AE",
                    { minimumFractionDigits: 2 }
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Totals */}
      <div className="rounded-2xl border border-sand bg-ivory p-6 space-y-3 text-body-md">
        <div className="flex justify-between text-mist">
          <span>Subtotal</span>
          <span>
            AED{" "}
            {Number(order.subtotal).toLocaleString("en-AE", {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="flex justify-between text-mist">
          <span>Shipping</span>
          <span>
            {Number(order.shippingFee) === 0 ? (
              <span className="text-sage">Free</span>
            ) : (
              `AED ${Number(order.shippingFee).toFixed(2)}`
            )}
          </span>
        </div>
        <div className="flex justify-between font-display text-body-lg font-semibold text-ink border-t border-sand pt-3">
          <span>Total</span>
          <span>
            AED{" "}
            {Number(order.total).toLocaleString("en-AE", {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>
        {paymentTx && (
          <p className="text-body-sm text-mist">
            {order.paymentMethod.replace(/_/g, " ")} · {paymentTx.externalRef}
          </p>
        )}
      </div>

      {/* Address */}
      <div className="rounded-2xl border border-sand bg-ivory p-6">
        <h2 className="font-display text-display-sm text-ink mb-2">
          Delivery Address
        </h2>
        <p className="text-body-md text-ink">{order.address.fullName}</p>
        <p className="text-body-md text-mist">{order.address.addressLine1}</p>
        {order.address.addressLine2 && (
          <p className="text-body-md text-mist">{order.address.addressLine2}</p>
        )}
        <p className="text-body-md text-mist">
          {order.address.city}
          {order.address.emirate ? `, ${order.address.emirate}` : ""}, UAE
        </p>
      </div>

      {/* Help */}
      <div className="rounded-xl border border-sand bg-sand/30 p-4 flex items-center justify-between">
        <p className="text-body-md text-ink">Need help with this order?</p>
        <Link href="/chat" className="text-body-sm text-gold hover:underline">
          Ask Luna →
        </Link>
      </div>
    </div>
  );
}
