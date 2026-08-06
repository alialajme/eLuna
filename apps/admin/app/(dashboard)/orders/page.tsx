import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, type OrderStatus } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { StatusFilter } from "../components/StatusFilter";

export const metadata: Metadata = { title: "Orders — Luna Ops" };

const ORDER_STATUS_BADGE: Record<string, string> = {
  DELIVERED: "bg-sage/20 text-sage",
  CONFIRMED: "bg-gold/20 text-gold",
  PROCESSING: "bg-gold/20 text-gold",
  SHIPPED: "bg-gold/20 text-gold",
  PENDING: "bg-sand text-mist",
  CANCELLED: "bg-coral/20 text-coral",
  REFUNDED: "bg-coral/20 text-coral",
};

const ORDER_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "PENDING" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Processing", value: "PROCESSING" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Refunded", value: "REFUNDED" },
];

const VALID: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

type Props = { searchParams: Promise<{ status?: string }> };

export default async function OrdersPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const raw = (await searchParams).status ?? "all";
  const where = VALID.includes(raw as OrderStatus)
    ? { status: raw as OrderStatus }
    : {};

  const orders = await prisma.order
    .findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        address: { select: { fullName: true } },
        items: { select: { id: true } },
      },
    })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Orders</h2>

      <StatusFilter status={raw} options={ORDER_FILTERS} />

      {orders.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">No orders found for this filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4 transition-colors hover:border-gold"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-body-sm font-medium text-ink">
                  #{order.id.slice(-8).toUpperCase()}
                </p>
                <p className="text-body-xs text-mist">{order.address.fullName}</p>
              </div>
              <p className="shrink-0 text-body-xs text-mist">
                {order.items.length} item{order.items.length === 1 ? "" : "s"}
              </p>
              <p className="shrink-0 text-body-xs text-mist">
                {new Date(order.createdAt).toLocaleDateString("en-AE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <p className="shrink-0 text-body-sm font-medium text-ink">
                AED {Number(order.total).toLocaleString("en-AE", { maximumFractionDigits: 0 })}
              </p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${ORDER_STATUS_BADGE[order.status] ?? "bg-sand text-mist"}`}
              >
                {order.status.charAt(0) + order.status.slice(1).toLowerCase()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
