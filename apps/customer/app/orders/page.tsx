import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";

export const metadata: Metadata = {
  title: "Orders — Luna",
};

const STATUS_STYLES: Record<string, string> = {
  PENDING:    "bg-sand text-ink",
  CONFIRMED:  "bg-gold/20 text-gold",
  PROCESSING: "bg-gold/20 text-gold",
  SHIPPED:    "bg-sage/20 text-sage",
  DELIVERED:  "bg-sage/20 text-sage",
  CANCELLED:  "bg-coral/20 text-coral",
  REFUNDED:   "bg-mist/20 text-mist",
};

export default async function OrdersPage() {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="font-display text-display-md text-ink mb-4">Sign in to view your orders</p>
        <a
          href="/sign-in"
          className="inline-flex rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory"
        >
          Sign in
        </a>
      </div>
    );
  }

  const profile = await prisma.customerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  }).catch(() => null);

  const orders = profile
    ? await prisma.order.findMany({
        where: { customerId: profile.id },
        orderBy: { createdAt: "desc" },
        include: {
          items: { select: { quantity: true } },
        },
      }).catch(() => [])
    : [];

  if (orders.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="font-display text-display-md text-ink mb-2">No orders yet</p>
        <p className="text-body-md text-mist mb-6">Your orders will appear here once you shop</p>
        <Link
          href="/browse"
          className="inline-flex rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <h1 className="font-display text-display-lg text-ink mb-8">Orders</h1>
      <ul className="space-y-4">
        {orders.map((order) => {
          const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
          const statusClass = STATUS_STYLES[order.status] ?? "bg-sand text-ink";
          return (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="flex items-center justify-between rounded-2xl border border-sand bg-ivory p-5 hover:border-gold transition-colors"
              >
                <div>
                  <p className="font-display text-body-lg text-ink font-semibold">
                    #{order.id.slice(-8).toUpperCase()}
                  </p>
                  <p className="text-body-sm text-mist mt-1">
                    {new Date(order.createdAt).toLocaleDateString("en-AE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    · {itemCount} item{itemCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`rounded-full px-3 py-1 text-label uppercase ${statusClass}`}>
                    {order.status}
                  </span>
                  <p className="font-display text-body-lg text-gold">
                    AED {Number(order.total).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
