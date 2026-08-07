import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";

export const metadata: Metadata = { title: "Customers — Luna Ops" };

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

export default async function CustomersPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const [customers, orders] = await Promise.all([
    prisma.customerProfile
      .findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          loyaltyPoints: true,
          walletBalance: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      })
      .catch(() => []),
    prisma.order
      .findMany({
        where: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
        select: { customerId: true, total: true },
      })
      .catch(() => []),
  ]);

  const statsByCustomer = new Map<string, { count: number; spent: number }>();
  for (const o of orders) {
    const prev = statsByCustomer.get(o.customerId) ?? { count: 0, spent: 0 };
    statsByCustomer.set(o.customerId, {
      count: prev.count + 1,
      spent: prev.spent + Number(o.total),
    });
  }

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Customers</h2>

      {customers.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">No customers yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {customers.map((c) => {
            const stats = statsByCustomer.get(c.id) ?? { count: 0, spent: 0 };
            return (
              <Link
                key={c.id}
                href={`/customers/${c.id}`}
                className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4 transition-colors hover:border-gold"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-body-sm font-medium text-ink">
                    {c.user.email}
                  </p>
                  <p className="text-body-xs text-mist">
                    Joined{" "}
                    {new Date(c.createdAt).toLocaleDateString("en-AE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <p className="shrink-0 text-body-xs text-mist">
                  {stats.count} order{stats.count === 1 ? "" : "s"}
                </p>
                <p className="shrink-0 text-body-sm font-medium text-ink">
                  {fmtAED(stats.spent)}
                </p>
                <div className="shrink-0 text-right">
                  <p className="text-body-xs text-mist">
                    {c.loyaltyPoints} pts · {fmtAED(Number(c.walletBalance))} wallet
                  </p>
                </div>
                <span className="shrink-0 text-body-sm text-gold">View →</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
