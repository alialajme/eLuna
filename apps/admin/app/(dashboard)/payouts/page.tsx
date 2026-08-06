import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma, type PayoutStatus } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { StatusFilter } from "../components/StatusFilter";
import { PayoutActions } from "../components/PayoutActions";
import { CreatePayoutButton } from "../components/CreatePayoutButton";

export const metadata: Metadata = { title: "Payouts — Luna Ops" };

const PAYOUT_STATUS_BADGE: Record<string, string> = {
  COMPLETED: "bg-sage/20 text-sage",
  PROCESSING: "bg-gold/20 text-gold",
  PENDING: "bg-sand text-mist",
  FAILED: "bg-coral/20 text-coral",
};

const PAYOUT_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "PENDING" },
  { label: "Processing", value: "PROCESSING" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Failed", value: "FAILED" },
];

const VALID: PayoutStatus[] = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"];

function maskIban(iban: string): string {
  if (iban.length <= 8) return iban;
  return iban.slice(0, 4) + "···" + iban.slice(-4);
}

function fmtAED(n: number, dp = 0): string {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

type Props = { searchParams: Promise<{ status?: string }> };

export default async function PayoutsPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const raw = (await searchParams).status ?? "all";

  const [vendors, deliveredItems, payouts] = await Promise.all([
    prisma.vendor
      .findMany({
        where: { status: "ACTIVE" },
        select: { id: true, storeName: true, ibanNumber: true, commissionRate: true },
      })
      .catch(() => []),
    prisma.orderItem
      .findMany({
        where: { fulfillmentStatus: "DELIVERED" },
        select: { vendorId: true, unitPrice: true, quantity: true },
      })
      .catch(() => []),
    prisma.payout
      .findMany({
        orderBy: { createdAt: "desc" },
        include: { vendor: { select: { storeName: true } } },
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
  const paidByVendor = new Map<string, number>();
  for (const p of payouts) {
    if (p.status === "COMPLETED") {
      paidByVendor.set(p.vendorId, (paidByVendor.get(p.vendorId) ?? 0) + Number(p.amount));
    }
  }

  const owed = vendors
    .map((v) => {
      const gross = grossByVendor.get(v.id) ?? 0;
      const rate = Number(v.commissionRate ?? 0.15);
      const netEarned = gross - gross * rate;
      const paidOut = paidByVendor.get(v.id) ?? 0;
      const availableBalance = Math.max(0, netEarned - paidOut);
      return { ...v, netEarned, paidOut, availableBalance };
    })
    .filter((v) => v.availableBalance > 0);

  const history = VALID.includes(raw as PayoutStatus)
    ? payouts.filter((p) => p.status === raw)
    : payouts;

  return (
    <div className="max-w-4xl space-y-8">
      {/* Section 1: Vendors owed */}
      <div className="space-y-4">
        <h2 className="font-display text-display-md text-ink">Vendors owed</h2>
        {owed.length === 0 ? (
          <div className="rounded-lg border border-sand bg-white py-12 text-center">
            <p className="text-body-sm text-mist">No vendors currently owed a payout.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {owed.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-body-sm font-medium text-ink">{v.storeName}</p>
                  <p className="text-body-xs text-mist">
                    Net earned {fmtAED(v.netEarned)} · Paid out {fmtAED(v.paidOut)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-body-xs text-mist">Available</p>
                  <p className="text-body-md font-semibold text-ink">
                    {fmtAED(v.availableBalance)}
                  </p>
                </div>
                <CreatePayoutButton vendorId={v.id} disabled={!v.ibanNumber} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Payout history */}
      <div className="space-y-4">
        <h2 className="font-display text-display-md text-ink">Payout history</h2>
        <StatusFilter status={raw} options={PAYOUT_FILTERS} />
        {history.length === 0 ? (
          <div className="rounded-lg border border-sand bg-white py-12 text-center">
            <p className="text-body-sm text-mist">No payouts found for this filter.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-body-sm font-medium text-ink">
                    {p.vendor.storeName}
                  </p>
                  <p className="text-body-xs text-mist">
                    {maskIban(p.ibanNumber)} · {p.reference ?? "—"}
                  </p>
                </div>
                <p className="shrink-0 text-body-sm font-medium text-ink">
                  {fmtAED(Number(p.amount), 2)}
                </p>
                <p className="shrink-0 text-body-xs text-mist">
                  {new Date(p.createdAt).toLocaleDateString("en-AE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${PAYOUT_STATUS_BADGE[p.status] ?? "bg-sand text-mist"}`}
                >
                  {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                </span>
                <PayoutActions payoutId={p.id} status={p.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
