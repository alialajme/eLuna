import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";

export const metadata: Metadata = { title: "Luna Studio — Luna Vendor" };

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-sand text-mist",
  PROCESSING: "bg-gold/20 text-gold",
  COMPLETE: "bg-sage/20 text-sage",
  FAILED: "bg-coral/20 text-coral",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETE: "Complete",
  FAILED: "Failed",
};

export default async function StudioPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const uploads = await prisma.studioUpload
    .findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">Luna Studio</h2>
          <p className="mt-1 text-body-sm text-mist">
            Upload 3 photos of your abaya — Luna AI detects the garment and
            writes your full product copy.
          </p>
        </div>
        <Link
          href="/studio/new"
          className="rounded-full bg-ink px-5 py-2 text-body-sm font-medium text-gold hover:bg-ink/90"
        >
          ✦ New Campaign
        </Link>
      </div>

      {uploads.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">
            No campaigns yet. Upload your first product photos to get started.
          </p>
          <Link
            href="/studio/new"
            className="mt-4 inline-block text-body-sm text-gold hover:underline"
          >
            ✦ New Campaign →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {uploads.map((upload) => {
            const assets = upload.generatedAssets as Record<string, unknown>;
            const copy = assets.copy as { titleEn?: string } | undefined;
            const name = copy?.titleEn ?? "Untitled Campaign";
            const images = upload.sourceImages as string[];

            return (
              <div
                key={upload.id}
                className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
              >
                {/* Thumbnail strip */}
                <div className="flex gap-1.5 shrink-0">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-12 w-9 rounded bg-sand overflow-hidden"
                    >
                      {images[i] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={images[i]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="truncate text-body-sm font-medium text-ink">
                    {name}
                  </p>
                  <p className="text-body-xs text-mist">
                    {new Date(upload.createdAt).toLocaleDateString("en-AE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${STATUS_BADGE[upload.status] ?? "bg-sand text-mist"}`}
                >
                  {STATUS_LABEL[upload.status] ?? upload.status}
                </span>

                <Link
                  href={`/studio/${upload.id}`}
                  className="shrink-0 text-body-sm text-gold hover:underline"
                >
                  View →
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
