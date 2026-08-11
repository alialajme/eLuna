import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";

export const metadata: Metadata = { title: "My material orders — Luna Vendor" };

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

export default async function MyMaterialOrdersPage() {
  const user = await safeCurrentUser();
  if (!user) return null;
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null;

  const orders = await prisma.materialOrder
    .findMany({
      where: { vendorId: vendor.id },
      include: { items: true, supplier: { select: { companyName: true } } },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-md text-ink">My material orders</h2>
        <Link href="/sourcing" className="text-body-sm text-mist hover:text-ink">Browse sourcing →</Link>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-ivory py-16 text-center">
          <p className="text-body-md text-ink">No orders yet</p>
          <p className="text-body-sm text-mist mt-1">Order materials from the Sourcing tab.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => {
            const first = o.items[0];
            return (
              <Link key={o.id} href={`/sourcing/orders/${o.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-sand bg-ivory p-5 hover:border-ink transition-colors">
                <div className="min-w-0">
                  <p className="text-body-md font-medium text-ink truncate">
                    {first ? `${first.quantity} × ${first.materialName}` : "Order"}
                  </p>
                  <p className="text-body-xs text-mist">{o.supplier.companyName}</p>
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
