import { Metadata } from "next";
import { prisma, computeSupplierBalance } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";

export const metadata: Metadata = { title: "Earnings & Payouts — Luna Supplier" };

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-sand text-mist",
  PROCESSING: "bg-gold/20 text-gold",
  COMPLETED: "bg-sage/20 text-sage",
  FAILED: "bg-coral/10 text-coral",
};

const aed = (v: unknown) => `AED ${Number(v).toFixed(2)}`;
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default async function SupplierPayoutsPage() {
  const user = await safeCurrentUser();
  if (!user) return null;
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return null;

  const [balance, payouts] = await Promise.all([
    computeSupplierBalance(supplier.id),
    prisma.supplierPayout
      .findMany({ where: { supplierId: supplier.id }, orderBy: { createdAt: "desc" } })
      .catch(() => []),
  ]);

  const cards = [
    { label: "Earned (completed orders)", value: balance.earned, accent: "text-ink" },
    { label: "Reserved (in-flight)", value: balance.reserved, accent: "text-mist" },
    { label: "Paid out", value: balance.paidOut, accent: "text-mist" },
    { label: "Available", value: balance.available, accent: "text-gold" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-display-lg text-ink">Earnings &amp; Payouts</h1>
        <p className="mt-1 text-body-md text-mist">
          Wholesale earnings from completed material orders. Payouts are issued by Luna operations to
          your IBAN on file.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-sand bg-ivory p-5">
            <p className="text-body-xs uppercase tracking-wide text-mist">{c.label}</p>
            <p className={`mt-2 font-display text-display-sm ${c.accent}`}>{aed(c.value)}</p>
          </div>
        ))}
      </div>

      {!supplier.ibanNumber && (
        <div className="rounded-2xl border border-coral/30 bg-coral/5 p-4 text-body-sm text-coral">
          Add an IBAN in Settings so operations can issue your payouts.
        </div>
      )}

      <div>
        <h2 className="font-display text-display-sm text-ink mb-3">Payout history</h2>
        {payouts.length === 0 ? (
          <p className="rounded-2xl border border-sand bg-ivory p-6 text-body-md text-mist">
            No payouts yet. Once operations process a payout it will appear here.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-sand">
            <table className="w-full text-body-sm">
              <thead className="bg-sand/40 text-left text-mist">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">IBAN</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-t border-sand bg-ivory">
                    <td className="px-4 py-3 text-ink">
                      {new Date(p.createdAt).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">{aed(p.amount)}</td>
                    <td className="px-4 py-3 text-mist">{p.ibanNumber}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-body-xs ${STATUS_CLASSES[p.status] ?? "bg-sand text-mist"}`}
                      >
                        {label(p.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
