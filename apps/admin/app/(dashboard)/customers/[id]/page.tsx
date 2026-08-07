import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Customer — Luna Ops" };

const ORDER_STATUS_BADGE: Record<string, string> = {
  DELIVERED: "bg-sage/20 text-sage",
  CONFIRMED: "bg-gold/20 text-gold",
  PROCESSING: "bg-gold/20 text-gold",
  SHIPPED: "bg-gold/20 text-gold",
  PENDING: "bg-sand text-mist",
  CANCELLED: "bg-coral/20 text-coral",
  REFUNDED: "bg-coral/20 text-coral",
};

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const customer = await prisma.customerProfile
    .findUnique({
      where: { id },
      select: {
        id: true,
        loyaltyPoints: true,
        walletBalance: true,
        createdAt: true,
        user: { select: { email: true } },
        sizeProfile: { select: { id: true } },
        _count: { select: { wishlists: true, reviews: true } },
        orders: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            total: true,
            status: true,
            createdAt: true,
            address: { select: { fullName: true } },
          },
        },
      },
    })
    .catch(() => null);

  if (!customer) redirect("/customers");

  const displayName = customer.orders[0]?.address.fullName ?? "Customer";
  const totalSpent = customer.orders
    .filter((o) => o.status !== "CANCELLED" && o.status !== "REFUNDED")
    .reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-display-md text-ink">{displayName}</h2>
        <p className="mt-1 text-body-xs text-mist">
          {customer.user.email} · Joined {fmtDate(customer.createdAt)}
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-body-xs text-mist">Total orders</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {customer.orders.length}
          </p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-body-xs text-mist">Total spent</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {fmtAED(totalSpent)}
          </p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-body-xs text-mist">Loyalty points</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {customer.loyaltyPoints}
          </p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-body-xs text-mist">Wallet</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {fmtAED(Number(customer.walletBalance))}
          </p>
        </div>
      </div>

      {/* Order history */}
      <div className="rounded-lg border border-sand bg-white p-5">
        <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
          Order history
        </p>
        {customer.orders.length === 0 ? (
          <p className="text-body-sm text-mist">No orders yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {customer.orders.map((o) => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="flex items-center gap-4 rounded-lg border border-sand p-3 transition-colors hover:border-gold"
              >
                <p className="flex-1 truncate text-body-sm text-ink">
                  #{o.id.slice(-8).toUpperCase()}
                </p>
                <p className="shrink-0 text-body-xs text-mist">
                  {fmtDate(o.createdAt)}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${ORDER_STATUS_BADGE[o.status] ?? "bg-sand text-mist"}`}
                >
                  {o.status.charAt(0) + o.status.slice(1).toLowerCase()}
                </span>
                <p className="shrink-0 text-body-sm font-medium text-ink">
                  {fmtAED(Number(o.total))}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Info row */}
      <p className="text-body-xs text-mist">
        {customer._count.wishlists} wishlist items · {customer._count.reviews}{" "}
        reviews · Size profile {customer.sizeProfile ? "on file" : "not set"}
      </p>
    </div>
  );
}
