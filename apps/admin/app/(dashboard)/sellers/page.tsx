import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, type VendorStatus } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { StatusFilter } from "../components/StatusFilter";

export const metadata: Metadata = { title: "Sellers — Luna Ops" };

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-gold/20 text-gold",
  ACTIVE: "bg-sage/20 text-sage",
  SUSPENDED: "bg-coral/20 text-coral",
  REJECTED: "bg-sand text-mist",
};

const VALID: VendorStatus[] = ["PENDING", "ACTIVE", "SUSPENDED", "REJECTED"];

type Props = { searchParams: Promise<{ status?: string }> };

export default async function SellersPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const raw = (await searchParams).status ?? "all";
  const where = VALID.includes(raw as VendorStatus)
    ? { status: raw as VendorStatus }
    : {};

  const vendors = await prisma.vendor
    .findMany({ where, orderBy: { createdAt: "desc" } })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-md text-ink">Sellers</h2>
      </div>

      <StatusFilter status={raw} />

      {vendors.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">No vendors found for this filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {vendors.map((v) => (
            <Link
              key={v.id}
              href={`/sellers/${v.id}`}
              className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4 transition-colors hover:border-gold"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-body-sm font-medium text-ink">
                  {v.storeName}
                </p>
                <p className="text-body-xs text-mist">@{v.storeSlug}</p>
              </div>
              <p className="shrink-0 text-body-xs text-mist">
                {new Date(v.createdAt).toLocaleDateString("en-AE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${STATUS_BADGE[v.status] ?? "bg-sand text-mist"}`}
              >
                {v.status.charAt(0) + v.status.slice(1).toLowerCase()}
              </span>
              <span className="shrink-0 text-body-sm text-gold">View →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
