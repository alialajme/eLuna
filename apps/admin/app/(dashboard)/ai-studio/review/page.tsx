import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@ayvana/db";
import { safeCurrentUser } from "../../../lib/auth";
import { ReviewActions } from "../components/ReviewActions";

export const metadata: Metadata = { title: "Review queue — AYVANA Ops" };

const dateFmt = (d: Date) =>
  new Date(d).toLocaleString("en-AE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Manual-review queue: shoots that fell below the fidelity floor land in
// REVIEW_REQUIRED (never auto-published). Admin approves (→ vendor can use it)
// or rejects (→ failed + reserved shoot released, no charge).
export default async function ReviewQueuePage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const sessions = await prisma.generationSession
    .findMany({
      where: { status: "REVIEW_REQUIRED" },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        vendor: { select: { storeName: true } },
        product: { select: { title: true } },
        jobs: { select: { error: true, state: true }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { assets: true } },
      },
    })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">Review queue</h2>
          <p className="mt-1 text-body-sm text-mist">
            Shoots held below the fidelity floor. Approve to release, or reject to release the reserved shoot.
          </p>
        </div>
        <Link href="/ai-studio" className="text-body-sm text-gold underline-offset-2 hover:underline">
          Back to dashboard
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white p-8 text-center">
          <p className="text-body-sm text-ink">Nothing to review.</p>
          <p className="mt-1 text-body-xs text-mist">Shoots that pass the fidelity gate are released automatically.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-sand bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sand bg-sand/30 text-left">
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Seller</th>
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Product</th>
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Reason</th>
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Queued</th>
                <th className="px-4 py-2.5 text-right text-body-xs font-medium text-mist">Decision</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-sand/50 last:border-0">
                  <td className="px-4 py-3 text-body-sm font-medium text-ink">{s.vendor.storeName}</td>
                  <td className="px-4 py-3 text-body-sm text-mist">{s.product?.title ?? "New product"}</td>
                  <td className="px-4 py-3 text-body-sm text-mist">{s.jobs[0]?.error ?? "Below fidelity floor"}</td>
                  <td className="px-4 py-3 text-body-sm text-mist">{dateFmt(s.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <ReviewActions sessionId={s.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
