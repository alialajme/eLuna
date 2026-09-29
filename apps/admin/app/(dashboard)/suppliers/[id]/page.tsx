import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { SupplierActions } from "../../components/SupplierActions";
import { OnboardingBanner } from "../../components/OnboardingBanner";

type Props = { params: Promise<{ id: string }> };

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-gold/20 text-gold",
  ACTIVE: "bg-sage/20 text-sage",
  SUSPENDED: "bg-coral/20 text-coral",
  REJECTED: "bg-sand text-mist",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supplier = await prisma.supplier
    .findUnique({ where: { id }, select: { companyName: true } })
    .catch(() => null);
  return { title: `${supplier?.companyName ?? "Supplier"} — Luna Ops` };
}

function maskIban(iban: string): string {
  if (iban.length <= 8) return iban;
  return iban.slice(0, 4) + "···" + iban.slice(-4);
}

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

const LICENSE_LABEL: Record<string, string> = {
  VERIFIED: "Verified",
  PENDING: "Pending verification",
  REJECTED: "Rejected",
  UNVERIFIED: "Not verified",
};

export default async function SupplierDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const supplier = await prisma.supplier
    .findUnique({ where: { id }, include: { user: { select: { mfaEnabled: true } } } })
    .catch(() => null);
  if (!supplier) redirect("/suppliers");

  // Wholesale sales fulfilled by this supplier (COMPLETED material orders).
  const orders = await prisma.materialOrder
    .findMany({ where: { supplierId: id, status: "COMPLETED" }, select: { total: true } })
    .catch(() => []);
  const salesTotal = orders.reduce((s, o) => s + Number(o.total), 0);

  const statusLabel = supplier.status.charAt(0) + supplier.status.slice(1).toLowerCase();

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sand">
            <span className="font-display text-display-sm text-mist">{supplier.companyName.charAt(0)}</span>
          </div>
          <div>
            <h2 className="font-display text-display-md text-ink">{supplier.companyName}</h2>
            <p className="text-body-xs text-mist">@{supplier.companySlug}</p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-body-sm font-medium ${STATUS_BADGE[supplier.status] ?? "bg-sand text-mist"}`}
        >
          {statusLabel}
        </span>
      </div>

      <OnboardingBanner ibanMissing={!supplier.ibanNumber} mfaMissing={!supplier.user.mfaEnabled} />

      {/* Actions */}
      <div className="rounded-lg border border-sand bg-white p-4">
        <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">Actions</p>
        <SupplierActions supplierId={supplier.id} status={supplier.status} />
      </div>

      {/* Info grid */}
      <div className="rounded-lg border border-sand bg-white p-5">
        <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">Company details</p>
        <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-body-xs text-mist">Materials supplied</dt>
            <dd className="text-body-sm text-ink capitalize">
              {supplier.materialTypes.length ? supplier.materialTypes.join(", ") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-body-xs text-mist">Trade licence</dt>
            <dd className="text-body-sm text-ink">
              {LICENSE_LABEL[supplier.tradeLicenseStatus] ?? "Not verified"}
              {supplier.tradeLicenseNumber ? ` · ${supplier.tradeLicenseNumber}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-body-xs text-mist">TRN</dt>
            <dd className="text-body-sm text-ink">{supplier.trn ?? "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-body-xs text-mist">IBAN</dt>
            <dd className="text-body-sm text-ink">
              {supplier.ibanNumber ? maskIban(supplier.ibanNumber) : "Not provided"}
            </dd>
          </div>
          <div>
            <dt className="text-body-xs text-mist">Joined</dt>
            <dd className="text-body-sm text-ink">
              {new Date(supplier.createdAt).toLocaleDateString("en-AE", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </dd>
          </div>
        </dl>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="text-body-xs text-mist">Completed orders</p>
          <p className="mt-1 font-display text-display-sm text-ink">{orders.length}</p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="text-body-xs text-mist">Wholesale sales</p>
          <p className="mt-1 font-display text-display-sm text-ink">{fmtAED(salesTotal)}</p>
        </div>
      </div>
    </div>
  );
}
