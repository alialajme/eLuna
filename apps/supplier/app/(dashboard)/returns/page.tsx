import { Metadata } from "next";
import Link from "next/link";
import { prisma, type MaterialReturnStatus } from "@ayvana/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";
import { MaterialReturnActions } from "../components/MaterialReturnActions";

export const metadata: Metadata = { title: "Returns — AYVANA Supplier" };

const STATUS_CLASSES: Record<string, string> = {
  REQUESTED: "bg-gold/20 text-gold",
  APPROVED: "bg-gold/20 text-gold",
  RECEIVED: "bg-gold/20 text-gold",
  REFUNDED: "bg-sage/20 text-sage",
  REJECTED: "bg-coral/10 text-coral",
};

function label(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

const aed = (v: unknown) =>
  `AED ${Number(v).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;

type Props = { searchParams: Promise<{ status?: string }> };

export default async function SupplierReturnsPage({ searchParams }: Props) {
  const { status: statusParam } = await searchParams;

  const user = await safeCurrentUser();
  if (!user) return null;
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return null;

  const valid = ["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED", "REJECTED"];
  const statusFilter = valid.includes(statusParam ?? "") ? statusParam : undefined;

  const returns = await prisma.materialReturn
    .findMany({
      where: {
        supplierId: supplier.id,
        ...(statusFilter ? { status: statusFilter as MaterialReturnStatus } : {}),
      },
      include: {
        vendor: { select: { storeName: true } },
        order: { select: { id: true, items: { select: { materialName: true, quantity: true, unit: true } } } },
      },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  const tabs = [
    { label: "All", value: undefined },
    { label: "Requested", value: "REQUESTED" },
    { label: "Approved", value: "APPROVED" },
    { label: "Received", value: "RECEIVED" },
    { label: "Refunded", value: "REFUNDED" },
  ] as const;

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h2 className="font-display text-display-md text-ink">Returns</h2>
        <p className="text-body-sm text-mist mt-1">
          Return requests from vendors on materials you fulfilled. Refunding reverses that
          order&apos;s earnings from your payout balance.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = (t.value ?? undefined) === statusFilter;
          const href = t.value ? `/returns?status=${t.value}` : "/returns";
          return (
            <Link key={t.label} href={href}
              className={`rounded-md px-4 py-1.5 text-body-sm transition-colors ${
                active ? "bg-ink text-ivory" : "border border-sand text-mist hover:border-ink hover:text-ink"
              }`}>
              {t.label}
            </Link>
          );
        })}
      </div>

      {returns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-ivory py-16 text-center">
          <p className="text-body-md text-ink">No returns</p>
          <p className="text-body-sm text-mist mt-1">Return requests from vendors will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {returns.map((r) => {
            const first = r.order.items[0];
            return (
              <div key={r.id} className="rounded-2xl border border-sand bg-ivory p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-body-md font-medium text-ink truncate">
                      {first ? `${first.quantity} ${first.unit.toLowerCase()} × ${first.materialName}` : "Return"}
                    </p>
                    <p className="text-body-xs text-mist">{r.vendor.storeName}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <p className="text-body-sm text-ink">{aed(r.refundAmount)}</p>
                    <span className={`rounded-md px-3 py-1 text-body-xs font-medium ${STATUS_CLASSES[r.status] ?? "bg-sand text-mist"}`}>
                      {label(r.status)}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl bg-white/60 p-3">
                  <p className="text-body-xs text-mist">REASON</p>
                  <p className="text-body-sm text-ink">{r.reason}</p>
                  {r.resolutionNote && (
                    <p className="text-body-xs text-mist mt-1">Your note: {r.resolutionNote}</p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Link href={`/orders/${r.order.id}`} className="text-body-sm text-gold hover:underline">
                    View order →
                  </Link>
                  <MaterialReturnActions returnId={r.id} status={r.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
