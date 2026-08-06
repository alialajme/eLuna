import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";

export const metadata: Metadata = { title: "Overview — Luna Ops" };

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

export default async function OverviewPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const [gmvAgg, orderCount, activeVendors, pendingVendors] = await Promise.all([
    prisma.order
      .aggregate({
        _sum: { total: true },
        where: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
      })
      .catch(() => ({ _sum: { total: null } })),
    prisma.order
      .count({ where: { status: { notIn: ["CANCELLED", "REFUNDED"] } } })
      .catch(() => 0),
    prisma.vendor.count({ where: { status: "ACTIVE" } }).catch(() => 0),
    prisma.vendor.count({ where: { status: "PENDING" } }).catch(() => 0),
  ]);

  const gmv = Number(gmvAgg._sum.total ?? 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="font-display text-display-md text-ink">Platform Overview</h2>
        <p className="mt-1 text-body-sm text-mist">
          Live snapshot of marketplace activity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Platform GMV */}
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="text-body-xs text-mist">Platform GMV</p>
          <p className="mt-1 font-display text-display-sm text-ink">{fmtAED(gmv)}</p>
        </div>

        {/* Total Orders */}
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="text-body-xs text-mist">Total Orders</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {orderCount.toLocaleString("en-AE")}
          </p>
        </div>

        {/* Active Vendors */}
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="text-body-xs text-mist">Active Vendors</p>
          <p className="mt-1 font-display text-display-sm text-ink">{activeVendors}</p>
        </div>

        {/* Pending Approvals */}
        <Link
          href="/sellers/approvals"
          className="rounded-lg border border-sand bg-white p-5 transition-colors hover:border-gold"
        >
          <p className="text-body-xs text-mist">Pending Approvals</p>
          <p className="mt-1 font-display text-display-sm text-gold">{pendingVendors}</p>
        </Link>
      </div>
    </div>
  );
}
