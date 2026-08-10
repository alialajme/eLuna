import { redirect } from "next/navigation";
import { Metadata } from "next";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { ReturnActions } from "./components/ReturnActions";

export const metadata: Metadata = { title: "Returns — Luna Vendor" };

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-gold/20 text-gold",
  APPROVED: "bg-sage/20 text-sage",
  RECEIVED: "bg-ink/10 text-ink",
  REFUNDED: "bg-sage/20 text-sage",
  REJECTED: "bg-coral/20 text-coral",
};

export default async function ReturnsPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const returns = await prisma.return
    .findMany({
      where: { orderItem: { vendorId: vendor.id } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        reason: true,
        refundAmount: true,
        approvalNotes: true,
        orderItem: {
          select: {
            quantity: true,
            order: { select: { id: true } },
            variant: { select: { size: true, color: true, product: { select: { title: true } } } },
          },
        },
      },
    })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Returns</h2>
      {returns.length === 0 ? (
        <p className="text-body-md text-mist">No return requests yet.</p>
      ) : (
        <div className="space-y-3">
          {returns.map((r) => (
            <div key={r.id} className="rounded-lg border border-sand bg-ivory p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-body-md font-medium text-ink">{r.orderItem.variant.product.title}</p>
                  <p className="text-body-sm text-mist">
                    {r.orderItem.variant.size} / {r.orderItem.variant.color} · Qty {r.orderItem.quantity}
                  </p>
                  <p className="text-body-sm text-mist mt-1">
                    Order #{r.orderItem.order.id.slice(-8).toUpperCase()}
                  </p>
                  <p className="mt-2 text-body-sm italic text-ink">{r.reason}</p>
                  {r.approvalNotes && <p className="mt-1 text-body-xs text-mist">Note: {r.approvalNotes}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`rounded-full px-3 py-1 text-label uppercase font-semibold ${
                      STATUS_STYLES[r.status] ?? "bg-sand text-ink"
                    }`}
                  >
                    {r.status}
                  </span>
                  <p className="mt-2 text-body-md font-medium text-ink">
                    AED {Number(r.refundAmount).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <ReturnActions returnId={r.id} status={r.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
