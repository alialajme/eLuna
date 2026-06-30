import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";

export const metadata: Metadata = { title: "Payouts — Luna Vendor" };

function maskIban(iban: string): string {
  return iban.slice(0, 4) + "···" + iban.slice(-4);
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-sand text-mist",
  PROCESSING: "bg-gold/20 text-gold",
  COMPLETED: "bg-sage/20 text-sage",
  FAILED: "bg-coral/20 text-coral",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export default async function PayoutsPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const vendorWithRate = await prisma.vendor
    .findUnique({
      where: { id: vendor.id },
      select: { commissionRate: true },
    })
    .catch(() => null);

  const commissionRate = Number(vendorWithRate?.commissionRate ?? 0.15);
  const commissionPct = Math.round(commissionRate * 100);

  const [items, payouts] = await Promise.all([
    prisma.orderItem
      .findMany({
        where: { vendorId: vendor.id, fulfillmentStatus: "DELIVERED" },
        select: { unitPrice: true, quantity: true },
      })
      .catch(() => []),
    prisma.payout
      .findMany({
        where: { vendorId: vendor.id },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => []),
  ]);

  const grossRevenue = items.reduce(
    (s, i) => s + Number(i.unitPrice) * i.quantity,
    0
  );
  const platformFee = grossRevenue * commissionRate;
  const netEarned = grossRevenue - platformFee;
  const paidOut = payouts
    .filter((p) => p.status === "COMPLETED")
    .reduce((s, p) => s + Number(p.amount), 0);
  const availableBalance = Math.max(0, netEarned - paidOut);

  const fmt = (n: number) =>
    n.toLocaleString("en-AE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="font-display text-display-md text-ink">Payouts</h2>

      {/* Earnings summary */}
      <div className="rounded-lg border border-sand bg-white p-5">
        <p className="mb-4 text-body-xs font-medium uppercase tracking-wide text-mist">
          Earnings summary — all time
        </p>
        <div className="grid grid-cols-4 gap-5">
          <div>
            <p className="mb-1 text-body-xs text-mist">Gross revenue</p>
            <p className="font-display text-display-sm text-ink">
              AED {fmt(grossRevenue)}
            </p>
          </div>
          <div>
            <p className="mb-1 text-body-xs text-mist">
              Platform fee ({commissionPct}%)
            </p>
            <p className="font-display text-display-sm text-coral">
              − AED {fmt(platformFee)}
            </p>
          </div>
          <div>
            <p className="mb-1 text-body-xs text-mist">Paid out</p>
            <p className="font-display text-display-sm text-ink">
              AED {fmt(paidOut)}
            </p>
          </div>
          <div className="border-l-2 border-gold pl-5">
            <p className="mb-1 text-body-xs text-mist">Available balance</p>
            <p className="font-display text-display-sm text-gold">
              AED {fmt(availableBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* Payout history */}
      <div>
        <p className="mb-3 text-body-sm font-medium text-ink">
          Payout history
        </p>
        {payouts.length === 0 ? (
          <p className="text-body-sm text-mist">
            No payouts yet. Luna Operations processes payouts bi-monthly.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-sand text-left">
                <th className="pb-2 text-body-xs font-medium text-mist">
                  Date
                </th>
                <th className="pb-2 text-body-xs font-medium text-mist">
                  Amount
                </th>
                <th className="pb-2 text-body-xs font-medium text-mist">
                  IBAN
                </th>
                <th className="pb-2 text-body-xs font-medium text-mist">
                  Reference
                </th>
                <th className="pb-2 text-body-xs font-medium text-mist">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-b border-sand/50">
                  <td className="py-2.5 pr-3 text-body-sm text-mist">
                    {new Date(p.createdAt).toLocaleDateString("en-AE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="py-2.5 pr-3 text-body-sm font-medium text-ink">
                    AED {fmt(Number(p.amount))}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-body-sm text-mist">
                    {maskIban(p.ibanNumber)}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-body-sm text-mist">
                    {p.reference ?? "—"}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-body-xs font-medium ${STATUS_BADGE[p.status] ?? "bg-sand text-mist"}`}
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-4 text-body-xs text-mist">
          Payouts are processed by Luna Operations. Contact support if a payout
          is overdue.
        </p>
      </div>
    </div>
  );
}
