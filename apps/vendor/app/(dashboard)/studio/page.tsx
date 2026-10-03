import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listSessionsForVendor } from "@ayvana/studio";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";

export const metadata: Metadata = { title: "AYVANA Studio — AYVANA Vendor" };

// Map the session status to a seller-facing label + pill style (incumbent
// StatusBadge palette: sand/mist pending, gold working, sage done, coral failed).
const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-sand text-mist" },
  RUNNING: { label: "In progress", cls: "bg-gold/20 text-gold" },
  PREVIEW: { label: "Ready", cls: "bg-sage/20 text-sage" },
  APPROVED: { label: "Approved", cls: "bg-sage/20 text-sage" },
  PUBLISHED: { label: "Published", cls: "bg-sage/20 text-sage" },
  REVIEW_REQUIRED: { label: "In review", cls: "bg-gold/20 text-gold" },
  FAILED: { label: "Failed", cls: "bg-coral/20 text-coral" },
  CANCELLED: { label: "Cancelled", cls: "bg-sand text-mist" },
};

export default async function StudioPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const sessions = await listSessionsForVendor(vendor.id);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-display-md text-ink">AYVANA Studio</h2>
          <p className="mt-1 max-w-md text-body-sm text-mist">
            Turn a few garment photos into a full on-model shoot — four polished views, ready for your listing.
          </p>
        </div>
        <Link
          href="/studio/new"
          className="shrink-0 rounded-md bg-ink px-5 py-2 text-body-sm font-medium text-gold transition-colors hover:bg-ink/90"
        >
          New shoot
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-md border border-dashed border-sand bg-white px-6 py-16 text-center">
          <p className="font-display text-display-sm text-ink">No shoots yet</p>
          <p className="mx-auto mt-2 max-w-sm text-body-sm text-mist">
            Add front and back photos of an abaya and we will create a complete on-model shoot for you.
          </p>
          <Link
            href="/studio/new"
            className="mt-5 inline-block rounded-md bg-ink px-5 py-2 text-body-sm font-medium text-gold transition-colors hover:bg-ink/90"
          >
            Start your first shoot
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((s) => {
            const status = STATUS[s.status] ?? { label: s.status, cls: "bg-sand text-mist" };
            return (
              <li key={s.id}>
                <Link
                  href={`/studio/${s.id}`}
                  className="flex items-center gap-4 rounded-md border border-sand bg-white p-4 transition-colors hover:border-gold/60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-ink">
                      Shoot ·{" "}
                      {new Date(s.createdAt).toLocaleDateString("en-AE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    <p className="font-mono text-body-xs text-mist">{s.id.slice(0, 8)}</p>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-body-xs font-medium ${status.cls}`}>
                    {status.label}
                  </span>
                  <span className="shrink-0 text-body-sm text-gold">View</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
