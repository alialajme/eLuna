import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";

export const metadata: Metadata = { title: "Fraud — Luna Ops" };

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

// Customer-level: true if any 3 of the (ascending) timestamps fall within 24h.
function hasRapidRepeat(times: number[]): boolean {
  for (let i = 0; i + 2 < times.length; i++) {
    if (times[i + 2]! - times[i]! <= DAY_MS) return true;
  }
  return false;
}

const REASON_BADGE: Record<string, string> = {
  "Failed payment": "bg-coral/20 text-coral",
  "High value": "bg-gold/20 text-gold",
  "Rapid repeat": "bg-gold/20 text-gold",
};

export default async function FraudPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const windowStart = new Date(Date.now() - 90 * DAY_MS);
  const orders = await prisma.order
    .findMany({
      where: { createdAt: { gte: windowStart } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        total: true,
        createdAt: true,
        customerId: true,
        customer: { select: { user: { select: { email: true } } } },
        paymentTransactions: { select: { status: true } },
      },
    })
    .catch(() => []);

  const meanOrderValue =
    orders.length === 0
      ? 0
      : orders.reduce((s, o) => s + Number(o.total), 0) / orders.length;

  const timesByCustomer = new Map<string, number[]>();
  for (const o of orders) {
    const arr = timesByCustomer.get(o.customerId) ?? [];
    arr.push(o.createdAt.getTime());
    timesByCustomer.set(o.customerId, arr);
  }
  const rapidCustomers = new Set<string>();
  for (const [customerId, times] of timesByCustomer) {
    const sorted = [...times].sort((a, b) => a - b);
    if (hasRapidRepeat(sorted)) rapidCustomers.add(customerId);
  }

  const flagged = orders
    .map((o) => {
      const reasons: string[] = [];
      if (o.paymentTransactions.some((t) => t.status === "FAILED")) {
        reasons.push("Failed payment");
      }
      if (meanOrderValue > 0 && Number(o.total) >= 3 * meanOrderValue) {
        reasons.push("High value");
      }
      if (rapidCustomers.has(o.customerId)) {
        reasons.push("Rapid repeat");
      }
      return { ...o, reasons };
    })
    .filter((o) => o.reasons.length > 0);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-display-md text-ink">Fraud review</h2>
        <span className="text-body-sm text-mist">
          {flagged.length} flagged order{flagged.length === 1 ? "" : "s"}
        </span>
      </div>

      {flagged.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">
            No flagged orders — nothing suspicious right now.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {flagged.map((o) => (
            <div
              key={o.id}
              className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-body-sm font-medium text-ink">
                  #{o.id.slice(-8).toUpperCase()}
                </p>
                <p className="truncate text-body-xs text-mist">
                  {o.customer.user.email}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {o.reasons.map((r) => (
                  <span
                    key={r}
                    className={`rounded-full px-2 py-0.5 text-body-xs font-medium ${REASON_BADGE[r] ?? "bg-sand text-mist"}`}
                  >
                    {r}
                  </span>
                ))}
              </div>
              <p className="shrink-0 text-body-sm font-medium text-ink">
                {fmtAED(Number(o.total))}
              </p>
              <Link
                href={`/orders/${o.id}`}
                className="shrink-0 text-body-sm text-gold hover:underline"
              >
                View order →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
