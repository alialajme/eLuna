import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, type SupplierStatus } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { StatusFilter } from "../components/StatusFilter";

export const metadata: Metadata = { title: "Suppliers — Luna Ops" };

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-gold/20 text-gold",
  ACTIVE: "bg-sage/20 text-sage",
  SUSPENDED: "bg-coral/20 text-coral",
  REJECTED: "bg-sand text-mist",
};

const SUPPLIER_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "PENDING" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Rejected", value: "REJECTED" },
];

const VALID: SupplierStatus[] = ["PENDING", "ACTIVE", "SUSPENDED", "REJECTED"];

type Props = { searchParams: Promise<{ status?: string }> };

export default async function SuppliersPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const raw = (await searchParams).status ?? "all";
  const where = VALID.includes(raw as SupplierStatus) ? { status: raw as SupplierStatus } : {};

  const suppliers = await prisma.supplier
    .findMany({ where, orderBy: { createdAt: "desc" } })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-md text-ink">Suppliers</h2>
        <Link
          href="/suppliers/new"
          className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors"
        >
          + Add supplier
        </Link>
      </div>

      <StatusFilter status={raw} options={SUPPLIER_FILTERS} />

      {suppliers.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">No suppliers found for this filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {suppliers.map((s) => (
            <Link
              key={s.id}
              href={`/suppliers/${s.id}`}
              className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4 transition-colors hover:border-gold"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-body-sm font-medium text-ink">{s.companyName}</p>
                <p className="text-body-xs text-mist">@{s.companySlug}</p>
              </div>
              <p className="shrink-0 text-body-xs text-mist">
                {new Date(s.createdAt).toLocaleDateString("en-AE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${STATUS_BADGE[s.status] ?? "bg-sand text-mist"}`}
              >
                {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
              </span>
              <span className="shrink-0 text-body-sm text-gold">View →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
