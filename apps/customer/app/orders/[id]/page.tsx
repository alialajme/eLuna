import { notFound } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import { prisma } from "@e-luna/db";
import { courierName, trackingUrl } from "@e-luna/ui/couriers";
import { safeCurrentUser } from "../../lib/auth";
import { TrackingTimeline } from "../components/TrackingTimeline";
import { ReturnButton } from "../components/ReturnButton";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order #${id.slice(-8).toUpperCase()} — Luna` };
}

export default async function OrderDetailPage({ params }: Props) {
  const [{ id }, user] = await Promise.all([params, safeCurrentUser()]);

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="font-display text-display-md text-ink mb-4">Sign in to view your order</p>
        <Link
          href="/sign-in"
          className="inline-flex rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory"
        >
          Sign in
        </Link>
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
          returns: { select: { id: true, status: true } },
        },
      },
      address: true,
      shipments: { orderBy: { createdAt: "asc" } },
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

  const paymentTx = order.paymentTransactions[0] ?? null;

  // Group items by shipment for the tracking display.
  const itemsByShipment = new Map<string, typeof order.items>();
  const unshippedItems: typeof order.items = [];
  for (const item of order.items) {
    if (item.shipmentId) {
      const arr = itemsByShipment.get(item.shipmentId) ?? [];
      arr.push(item);
      itemsByShipment.set(item.shipmentId, arr);
    } else {
      unshippedItems.push(item);
    }
  }

  const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" });

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

      {/* Shipments & tracking */}
      {order.shipments.map((s) => {
        const url = s.trackingNumber ? trackingUrl(s.courier, s.trackingNumber) : null;
        const shipmentItems = itemsByShipment.get(s.id) ?? [];
        return (
          <div key={s.id} className="rounded-2xl border border-sand bg-ivory p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-display-sm text-ink">{courierName(s.courier)}</h2>
              {s.trackingNumber &&
                (url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-body-sm text-gold hover:underline"
                  >
                    Track {s.trackingNumber} →
                  </a>
                ) : (
                  <span className="text-body-sm text-mist">{s.trackingNumber}</span>
                ))}
            </div>
            <TrackingTimeline status={s.status} />
            <div className="mt-3 flex justify-between text-body-sm text-mist">
              {s.estimatedDelivery && <span>Est. delivery {fmtDate(s.estimatedDelivery)}</span>}
              {s.deliveredAt && <span className="text-sage">Delivered {fmtDate(s.deliveredAt)}</span>}
            </div>
            {shipmentItems.length > 0 && (
              <ul className="mt-4 divide-y divide-sand border-t border-sand">
                {shipmentItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    returnNode={returnControl(item, s.deliveredAt, order.updatedAt)}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {/* Items not yet shipped */}
      {unshippedItems.length > 0 && (
        <div className="rounded-2xl border border-sand bg-ivory p-6">
          <h2 className="font-display text-display-sm text-ink mb-1">
            {order.shipments.length > 0 ? "Preparing your order" : "Items"}
          </h2>
          {order.shipments.length > 0 && (
            <p className="text-body-sm text-mist mb-3">These items haven&apos;t shipped yet.</p>
          )}
          <ul className="divide-y divide-sand">
            {unshippedItems.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}

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

function ItemRow({
  item,
  returnNode,
}: {
  item: {
    id: string;
    quantity: number;
    unitPrice: unknown;
    variant: { size: string; color: string; product: { title: string; slug: string; aiImages: unknown } };
  };
  returnNode?: React.ReactNode;
}) {
  const images = Array.isArray(item.variant.product.aiImages)
    ? (item.variant.product.aiImages as string[])
    : [];
  return (
    <li className="flex gap-4 py-4">
      <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-sand/40">
        {images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={images[0]} alt={item.variant.product.title} className="h-full w-full object-cover" />
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
        {returnNode}
      </div>
      <p className="font-display text-body-md text-gold whitespace-nowrap">
        AED {(Number(item.unitPrice) * item.quantity).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
      </p>
    </li>
  );
}

function returnControl(
  item: { id: string; fulfillmentStatus: string; returns: { status: string }[] },
  deliveredAt: Date | null,
  orderUpdatedAt: Date,
) {
  const active = item.returns.find((r) => r.status !== "REJECTED");
  if (active) {
    return <p className="mt-1 text-body-xs text-mist">Return: {active.status.toLowerCase()}</p>;
  }
  if (item.fulfillmentStatus !== "DELIVERED") return null;
  const anchor = deliveredAt ?? orderUpdatedAt;
  if (Date.now() - new Date(anchor).getTime() > 14 * 86_400_000) return null;
  return <ReturnButton orderItemId={item.id} />;
}
