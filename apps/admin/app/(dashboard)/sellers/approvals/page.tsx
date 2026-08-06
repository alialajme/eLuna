import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { VendorActions } from "../../components/VendorActions";

export const metadata: Metadata = { title: "Pending Approvals — Luna Ops" };

export default async function ApprovalsPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const pending = await prisma.vendor
    .findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } })
    .catch(() => []);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-display-md text-ink">Pending Approvals</h2>
        <span className="text-body-sm text-mist">{pending.length} waiting</span>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">
            No pending approvals — you&apos;re all caught up.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((v) => (
            <div
              key={v.id}
              className="rounded-lg border border-sand bg-white p-5"
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-body-md font-medium text-ink">{v.storeName}</p>
                  <p className="text-body-xs text-mist">@{v.storeSlug}</p>
                </div>
                <p className="shrink-0 text-body-xs text-mist">
                  {new Date(v.createdAt).toLocaleDateString("en-AE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>

              {v.description && (
                <p className="mb-3 text-body-sm text-mist">{v.description}</p>
              )}

              <div className="mb-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-sand px-2 py-0.5 text-body-xs text-ink">
                  {v.ibanNumber ? "IBAN on file" : "No IBAN"}
                </span>
                <span className="rounded-full bg-sand px-2 py-0.5 text-body-xs text-ink">
                  {v.mfaVerifiedAt ? "MFA verified" : "MFA pending"}
                </span>
              </div>

              <VendorActions vendorId={v.id} status={v.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
