import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@ayvana/db";
import { safeCurrentUser } from "../../../lib/auth";
import { SupplierActions } from "../../components/SupplierActions";

export const metadata: Metadata = { title: "Supplier Approvals — AYVANA Ops" };

const LICENSE_BADGE: Record<string, { className: string; label: string }> = {
  VERIFIED: { className: "bg-sage/20 text-sage", label: "Licence verified" },
  PENDING: { className: "bg-gold/20 text-gold", label: "Licence pending" },
  REJECTED: { className: "bg-coral/10 text-coral", label: "Licence rejected" },
  UNVERIFIED: { className: "bg-sand text-mist", label: "Licence not verified" },
};

export default async function SupplierApprovalsPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const pending = await prisma.supplier
    .findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } })
    .catch(() => []);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-display-md text-ink">Supplier Approvals</h2>
        <span className="text-body-sm text-mist">{pending.length} waiting</span>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">
            No pending suppliers — you&apos;re all caught up.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((s) => (
            <div key={s.id} className="rounded-lg border border-sand bg-white p-5">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-body-md font-medium text-ink">{s.companyName}</p>
                  <p className="text-body-xs text-mist">supply.ayvana.ae/{s.companySlug}</p>
                  {s.materialTypes.length > 0 && (
                    <p className="text-body-xs text-mist mt-1 capitalize">
                      Supplies: {s.materialTypes.join(", ")}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {(() => {
                      const b = LICENSE_BADGE[s.tradeLicenseStatus] ?? LICENSE_BADGE.UNVERIFIED!;
                      return (
                        <span className={`rounded-full px-2.5 py-0.5 text-body-xs font-medium ${b.className}`}>
                          {b.label}
                        </span>
                      );
                    })()}
                    {s.tradeLicenseNumber && (
                      <span className="text-body-xs text-mist font-mono">{s.tradeLicenseNumber}</span>
                    )}
                  </div>
                </div>
              </div>
              <SupplierActions supplierId={s.id} status={s.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
