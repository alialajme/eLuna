import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";

export const metadata: Metadata = { title: "Orders — Luna Vendor" };

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-sand text-mist",
  PROCESSING: "bg-gold/20 text-gold",
  SHIPPED: "bg-gold/40 text-ink",
  DELIVERED: "bg-sage/20 text-sage",
};

const STATUS_PRECEDENCE = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "RETURNED"];

function worstStatus(statuses: string[]): string {
  let worst = "DELIVERED";
  for (const s of statuses) {
    if (STATUS_PRECEDENCE.indexOf(s) < STATUS_PRECEDENCE.indexOf(worst)) {
      worst = s;
    }
  }
  return worst;
}

type Props = { searchParams: Promise<{ status?: string }> };

export default async function OrdersPage({ searchParams }: Props) {
  const { status: statusParam } = await searchParams;

  const user = await safeCurrentUser();
  if (!user) return null;

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null;

  const items = await prisma.orderItem
    .findMany({
      where: { vendorId: vendor.id },
      include: {
        order: { include: { address: true } },
        variant: { include: { product: { select: { title: true } } } },
      },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  // Group by orderId
  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const arr = grouped.get(item.orderId) ?? [];
    arr.push(item);
    grouped.set(item.orderId, arr);
  }

  type OrderGroup = {
    orderId: string;
    createdAt: Date;
    city: string;
    itemCount: number;
    subtotal: number;
    status: string;
  };

  const validStatuses = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED"];
  const statusFilter = validStatuses.includes(statusParam ?? "") ? statusParam : undefined;

  const orders: OrderGroup[] = [];
  for (const [orderId, groupItems] of grouped) {
    const ws = worstStatus(groupItems.map((i) => i.fulfillmentStatus));
    if (statusFilter && ws !== statusFilter) continue;
    const firstItem = groupItems[0];
    if (!firstItem?.order?.address) continue;
    orders.push({
      orderId,
      createdAt: firstItem.order.createdAt,
      city: firstItem.order.address.city,
      itemCount: groupItems.length,
      subtotal: groupItems.reduce(
        (sum, i) => sum + Number(i.unitPrice) * i.quantity,
        0
      ),
      status: ws,
    });
  }

  const tabs = [
    { label: "All", value: undefined },
    { label: "Pending", value: "PENDING" },
    { label: "Processing", value: "PROCESSING" },
    { label: "Shipped", value: "SHIPPED" },
    { label: "Delivered", value: "DELIVERED" },
  ] as const;

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Orders</h2>

      <div className="flex gap-1 border-b border-sand">
        {tabs.map((tab) => {
          const href = tab.value ? `/orders?status=${tab.value}` : "/orders";
          const isActive = statusFilter === tab.value;
          return (
            <Link
              key={tab.label}
              href={href}
              className={`px-4 py-2 text-body-sm transition-colors ${
                isActive
                  ? "border-b-2 border-gold text-gold"
                  : "text-mist hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <p className="text-body-md text-mist py-10">No orders yet.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-sand text-left">
              <th className="pb-2 text-body-xs font-medium text-mist">Order #</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Date</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Ship to</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Items</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Your subtotal</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Status</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr
                key={o.orderId}
                className="border-b border-sand/50 hover:bg-sand/30 transition-colors"
              >
                <td className="py-3 pr-4">
                  <span className="font-mono text-body-sm text-ink">
                    {o.orderId.slice(-8).toUpperCase()}
                  </span>
                </td>
                <td className="py-3 pr-4 text-body-sm text-mist">
                  {new Date(o.createdAt).toLocaleDateString("en-AE")}
                </td>
                <td className="py-3 pr-4 text-body-sm text-mist">{o.city}</td>
                <td className="py-3 pr-4 text-body-sm text-ink">{o.itemCount}</td>
                <td className="py-3 pr-4 text-body-sm text-ink">
                  AED{" "}
                  {o.subtotal.toLocaleString("en-AE", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-body-xs font-medium ${
                      STATUS_CLASSES[o.status] ?? "bg-sand text-mist"
                    }`}
                  >
                    {STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </td>
                <td className="py-3">
                  <Link
                    href={`/orders/${o.orderId}`}
                    className="text-body-xs text-gold hover:underline"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
