import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma, type PayoutStatus, computeSupplierBalance } from "@ayvana/db";
import { safeCurrentUser } from "../../lib/auth";
import { StatusFilter } from "../components/StatusFilter";
import { SupplierPayoutActions } from "../components/SupplierPayoutActions";
import { SupplierCreatePayoutButton } from "../components/SupplierCreatePayoutButton";

export const metadata: Metadata = { title: "Supplier Payouts — AYVANA Ops" };

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

export default async function SupplierPayoutsPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const raw = (await searchParams).status ?? "all";

  const [suppliers, payouts] = await Promise.all([
    prisma.supplier
      .findMany({
        where: { status: "ACTIVE" },
        select: { id: true, companyName: true, ibanNumber: true },
      })
      .catch(() => []),
    prisma.supplierPayout
      .findMany({
        orderBy: { createdAt: "desc" },
        include: { supplier: { select: { companyName: true } } },
      })
      .catch(() => []),
  ]);

  // Balance is computed by the single shared, Decimal, reserved-aware helper
  // (same source of truth as createSupplierPayout) so the UI and the action
  // agree: a supplier with an in-flight PENDING payout drops off the "owed"
  // list, which prevents the admin from creating a duplicate payout.
  const owedAll = await Promise.all(
    suppliers.map(async (s) => {
      const b = await computeSupplierBalance(s.id);
      return {
        ...s,
        earned: Number(b.earned),
        paidOut: Number(b.paidOut),
        reserved: Number(b.reserved),
        availableBalance: Number(b.available),
      };
    }),
  );
  const owed = owedAll.filter((s) => s.availableBalance > 0);

  const history = VALID.includes(raw as PayoutStatus)
    ? payouts.filter((p) => p.status === raw)
    : payouts;

  return (
    <div className="max-w-4xl space-y-8">
      {/* Section 1: Suppliers owed */}
      <div className="space-y-4">
        <h2 className="font-display text-display-md text-ink">Suppliers owed</h2>
        <p className="text-body-xs text-mist">
          Wholesale earnings from completed material orders. Suppliers are paid net (no commission).
        </p>
        {owed.length === 0 ? (
          <div className="rounded-lg border border-sand bg-white py-12 text-center">
            <p className="text-body-sm text-mist">No suppliers currently owed a payout.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {owed.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-body-sm font-medium text-ink">{s.companyName}</p>
                  <p className="text-body-xs text-mist">
                    Earned {fmtAED(s.earned)} · Paid out {fmtAED(s.paidOut)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-body-xs text-mist">Available</p>
                  <p className="text-body-md font-semibold text-ink">
                    {fmtAED(s.availableBalance)}
                  </p>
                </div>
                <SupplierCreatePayoutButton supplierId={s.id} disabled={!s.ibanNumber} />
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
                    {p.supplier.companyName}
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
                <SupplierPayoutActions payoutId={p.id} status={p.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
