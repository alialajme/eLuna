import { notFound } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";

export const metadata: Metadata = {
  title: "Order Confirmed — Luna",
};

type Props = { searchParams: Promise<{ orderId?: string }> };

export default async function OrderConfirmPage({ searchParams }: Props) {
  const { orderId } = await searchParams;
  if (!orderId) notFound();

  const user = await safeCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="font-display text-display-md text-ink mb-4">Sign in to view your order</p>
        <a href="/sign-in" className="inline-flex rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory">
          Sign in
        </a>
      </div>
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: {
                select: { title: true, slug: true, aiImages: true },
              },
            },
          },
        },
      },
      address: true,
      paymentTransactions: { take: 1 },
    },
  }).catch(() => null);

  if (!order) notFound();

  // Fail closed: always verify ownership; DB error surfaces as 500 (correct)
  const profile = await prisma.customerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile || order.customerId !== profile.id) notFound();

  const paymentTx = order.paymentTransactions[0];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 md:px-6">
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage/20 text-3xl">
          ✓
        </div>
        <h1 className="font-display text-display-lg text-ink">Order Confirmed</h1>
        <p className="mt-2 text-body-md text-mist">
          Order <span className="font-medium text-ink">#{order.id.slice(-8).toUpperCase()}</span>
        </p>
        <p className="mt-4 text-body-md text-gold">
          ✦ Luna has notified your boutique. Your order is on its way.
        </p>
      </div>

      <div className="rounded-2xl border border-sand bg-ivory p-6 mb-6">
        <h2 className="font-display text-display-sm text-ink mb-4">Items</h2>
        <ul className="divide-y divide-sand">
          {order.items.map((item) => {
            const images = Array.isArray(item.variant.product.aiImages)
              ? item.variant.product.aiImages as string[]
              : [];
            return (
              <li key={item.id} className="flex gap-4 py-4">
                <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-sand/40">
                  {images[0] ? (
                    <img src={images[0]} alt={item.variant.product.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-sand" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-body-md font-medium text-ink">{item.variant.product.title}</p>
                  <p className="text-body-sm text-mist">{item.variant.size} · {item.variant.color}</p>
                  <p className="text-body-sm text-mist">Qty: {item.quantity}</p>
                </div>
                <p className="font-display text-body-md text-gold">
                  AED {(Number(item.unitPrice) * item.quantity).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border border-sand bg-ivory p-6 mb-6 space-y-3 text-body-md">
        <div className="flex justify-between text-mist">
          <span>Subtotal</span>
          <span>AED {Number(order.subtotal).toLocaleString("en-AE", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between text-mist">
          <span>Shipping</span>
          <span>
            {Number(order.shippingFee) === 0
              ? <span className="text-sage">Free</span>
              : `AED ${Number(order.shippingFee).toFixed(2)}`}
          </span>
        </div>
        <div className="flex justify-between font-display text-body-lg font-semibold text-ink border-t border-sand pt-3">
          <span>Total</span>
          <span>AED {Number(order.total).toLocaleString("en-AE", { minimumFractionDigits: 2 })}</span>
        </div>
        {paymentTx && (
          <p className="text-body-sm text-mist pt-1">
            Paid via {order.paymentMethod.replace(/_/g, " ")} · Ref: {paymentTx.externalRef}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-sand bg-ivory p-6 mb-8">
        <h2 className="font-display text-display-sm text-ink mb-2">Delivery</h2>
        <p className="text-body-md text-ink">{order.address.fullName}</p>
        <p className="text-body-md text-mist">{order.address.addressLine1}</p>
        {order.address.addressLine2 && (
          <p className="text-body-md text-mist">{order.address.addressLine2}</p>
        )}
        <p className="text-body-md text-mist">
          {order.address.city}{order.address.emirate ? `, ${order.address.emirate}` : ""}, UAE
        </p>
        <p className="mt-3 text-body-sm text-mist">Estimated delivery: 2–5 business days</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/orders/${order.id}`}
          className="flex-1 flex items-center justify-center rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors"
        >
          Track Order
        </Link>
        <Link
          href="/browse"
          className="flex-1 flex items-center justify-center rounded-full border border-sand px-6 py-3 text-body-md font-medium text-ink hover:border-ink transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
