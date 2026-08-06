import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { VendorActions } from "../../components/VendorActions";

type Props = { params: Promise<{ id: string }> };

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-gold/20 text-gold",
  ACTIVE: "bg-sage/20 text-sage",
  SUSPENDED: "bg-coral/20 text-coral",
  REJECTED: "bg-sand text-mist",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const vendor = await prisma.vendor
    .findUnique({ where: { id }, select: { storeName: true } })
    .catch(() => null);
  return { title: `${vendor?.storeName ?? "Seller"} — Luna Ops` };
}

function maskIban(iban: string): string {
  if (iban.length <= 8) return iban;
  return iban.slice(0, 4) + "···" + iban.slice(-4);
}

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

export default async function SellerDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await prisma.vendor.findUnique({ where: { id } }).catch(() => null);
  if (!vendor) redirect("/sellers");

  const orderItems = await prisma.orderItem
    .findMany({
      where: { vendorId: id },
      select: { unitPrice: true, quantity: true, orderId: true },
    })
    .catch(() => []);

  const vendorGmv = orderItems.reduce(
    (s, i) => s + Number(i.unitPrice) * i.quantity,
    0
  );
  const vendorOrderCount = new Set(orderItems.map((i) => i.orderId)).size;

  const statusLabel =
    vendor.status.charAt(0) + vendor.status.slice(1).toLowerCase();

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sand">
            {vendor.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={vendor.logoUrl}
                alt={vendor.storeName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-display text-display-sm text-mist">
                {vendor.storeName.charAt(0)}
              </span>
            )}
          </div>
          <div>
            <h2 className="font-display text-display-md text-ink">
              {vendor.storeName}
            </h2>
            <p className="text-body-xs text-mist">@{vendor.storeSlug}</p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-body-sm font-medium ${STATUS_BADGE[vendor.status] ?? "bg-sand text-mist"}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Actions */}
      <div className="rounded-lg border border-sand bg-white p-4">
        <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
          Actions
        </p>
        <VendorActions vendorId={vendor.id} status={vendor.status} />
      </div>

      {/* Info grid */}
      <div className="rounded-lg border border-sand bg-white p-5">
        <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
          Store details
        </p>
        <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-body-xs text-mist">Description</dt>
            <dd className="text-body-sm text-ink">
              {vendor.description ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-body-xs text-mist">IBAN</dt>
            <dd className="text-body-sm text-ink">
              {vendor.ibanNumber ? maskIban(vendor.ibanNumber) : "Not provided"}
            </dd>
          </div>
          <div>
            <dt className="text-body-xs text-mist">Commission rate</dt>
            <dd className="text-body-sm text-ink">
              {Math.round(Number(vendor.commissionRate) * 100)}%
            </dd>
          </div>
          <div>
            <dt className="text-body-xs text-mist">MFA verified</dt>
            <dd className="text-body-sm text-ink">
              {vendor.mfaVerifiedAt
                ? new Date(vendor.mfaVerifiedAt).toLocaleDateString("en-AE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "Pending"}
            </dd>
          </div>
          <div>
            <dt className="text-body-xs text-mist">Joined</dt>
            <dd className="text-body-sm text-ink">
              {new Date(vendor.createdAt).toLocaleDateString("en-AE", {
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
          <p className="text-body-xs text-mist">Total Orders</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {vendorOrderCount}
          </p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="text-body-xs text-mist">Vendor GMV</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {fmtAED(vendorGmv)}
          </p>
        </div>
      </div>
    </div>
  );
}
