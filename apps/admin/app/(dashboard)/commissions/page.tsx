import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { CommissionEditor } from "../components/CommissionEditor";

export const metadata: Metadata = { title: "Commissions — Luna Ops" };

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-gold/20 text-gold",
  ACTIVE: "bg-sage/20 text-sage",
  SUSPENDED: "bg-coral/20 text-coral",
  REJECTED: "bg-sand text-mist",
};

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

export default async function CommissionsPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const [vendors, deliveredItems] = await Promise.all([
    prisma.vendor
      .findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          storeName: true,
          storeSlug: true,
          status: true,
          commissionRate: true,
        },
      })
      .catch(() => []),
    prisma.orderItem
      .findMany({
        where: { fulfillmentStatus: "DELIVERED" },
        select: { vendorId: true, unitPrice: true, quantity: true },
      })
      .catch(() => []),
  ]);

  const grossByVendor = new Map<string, number>();
  for (const item of deliveredItems) {
    grossByVendor.set(
      item.vendorId,
      (grossByVendor.get(item.vendorId) ?? 0) + Number(item.unitPrice) * item.quantity
    );
  }

  const rows = vendors.map((v) => {
    const gross = grossByVendor.get(v.id) ?? 0;
    const commissionRevenue = gross * Number(v.commissionRate);
    return { ...v, commissionRevenue };
  });

  const totalCommission = rows.reduce((sum, r) => sum + r.commissionRevenue, 0);

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h2 className="font-display text-display-md text-ink">Commissions</h2>
        <p className="mt-1 text-body-sm text-mist">
          Total platform commission revenue: {fmtAED(totalCommission)}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">No vendors yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-body-sm font-medium text-ink">{v.storeName}</p>
                <p className="text-body-xs text-mist">@{v.storeSlug}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${STATUS_BADGE[v.status] ?? "bg-sand text-mist"}`}
              >
                {v.status.charAt(0) + v.status.slice(1).toLowerCase()}
              </span>
              <div className="shrink-0 text-right">
                <p className="text-body-xs text-mist">Commission earned</p>
                <p className="text-body-sm text-ink">{fmtAED(v.commissionRevenue)}</p>
              </div>
              <CommissionEditor
                vendorId={v.id}
                ratePercent={Math.round(Number(v.commissionRate) * 100)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
