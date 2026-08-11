import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";

export const metadata: Metadata = { title: "Incoming orders — Luna Supplier" };

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-sand text-mist",
  ACCEPTED: "bg-gold/20 text-gold",
  SHIPPED: "bg-gold/20 text-gold",
  COMPLETED: "bg-sage/20 text-sage",
  CANCELLED: "bg-coral/10 text-coral",
  REJECTED: "bg-coral/10 text-coral",
};

function label(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

type Props = { searchParams: Promise<{ status?: string }> };

export default async function IncomingOrdersPage({ searchParams }: Props) {
  const { status: statusParam } = await searchParams;

  const user = await safeCurrentUser();
  if (!user) return null;
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return null;

  const validStatuses = ["PENDING", "ACCEPTED", "SHIPPED", "COMPLETED", "CANCELLED", "REJECTED"];
  const statusFilter = validStatuses.includes(statusParam ?? "") ? statusParam : undefined;

  const orders = await prisma.materialOrder
    .findMany({
      where: { supplierId: supplier.id, ...(statusFilter ? { status: statusFilter as "PENDING" } : {}) },
      include: { items: true, vendor: { select: { storeName: true } } },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  const tabs = [
    { label: "All", value: undefined },
    { label: "Pending", value: "PENDING" },
    { label: "Accepted", value: "ACCEPTED" },
    { label: "Shipped", value: "SHIPPED" },
    { label: "Completed", value: "COMPLETED" },
  ] as const;

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Incoming orders</h2>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = (t.value ?? undefined) === statusFilter;
          const href = t.value ? `/orders?status=${t.value}` : "/orders";
          return (
            <Link key={t.label} href={href}
              className={`rounded-full px-4 py-1.5 text-body-sm transition-colors ${
                active ? "bg-ink text-ivory" : "border border-sand text-mist hover:border-ink hover:text-ink"
              }`}>
              {t.label}
            </Link>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-ivory py-16 text-center">
          <p className="text-body-md text-ink">No orders</p>
          <p className="text-body-sm text-mist mt-1">Orders from vendors will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => {
            const first = o.items[0];
            return (
              <Link key={o.id} href={`/orders/${o.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-sand bg-ivory p-5 hover:border-ink transition-colors">
                <div className="min-w-0">
                  <p className="text-body-md font-medium text-ink truncate">
                    {first ? `${first.quantity} × ${first.materialName}` : "Order"}
                  </p>
                  <p className="text-body-xs text-mist">{o.vendor.storeName}</p>
                </div>
                <div className="flex items-center gap-5 shrink-0">
                  <p className="text-body-sm text-ink">
                    AED {Number(o.total).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                  </p>
                  <span className={`rounded-full px-3 py-1 text-body-xs font-medium ${STATUS_CLASSES[o.status] ?? "bg-sand text-mist"}`}>
                    {label(o.status)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
