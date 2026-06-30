import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";

type Props = { params: Promise<{ id: string }> };

type GarmentResult = {
  garmentType: string;
  color: string;
  fabric: string;
  style: string;
  details: string[];
};

type CopyResult = {
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  tags: string[];
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Campaign ${id.slice(-8).toUpperCase()} — Luna Studio` };
}

export default async function StudioResultPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const upload = await prisma.studioUpload
    .findUnique({ where: { id } })
    .catch(() => null);

  if (!upload || upload.vendorId !== vendor.id) redirect("/studio");

  const assets = upload.generatedAssets as Record<string, unknown>;
  const garment = assets?.garment as GarmentResult | undefined;
  const copy = assets?.copy as CopyResult | undefined;
  const errorMsg = assets?.error as string | undefined;
  const sourceImages = (upload.sourceImages as string[]) ?? [];

  const isPolling =
    upload.status === "PENDING" || upload.status === "PROCESSING";

  return (
    <div className="max-w-3xl space-y-6">
      {isPolling && (
        // eslint-disable-next-line @next/next/no-head-element
        <meta httpEquiv="refresh" content="3" />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">
            {copy?.titleEn ?? "Campaign"}
          </h2>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-body-xs font-medium ${
              upload.status === "COMPLETE"
                ? "bg-sage/20 text-sage"
                : upload.status === "FAILED"
                  ? "bg-coral/20 text-coral"
                  : "bg-gold/20 text-gold"
            }`}
          >
            {upload.status === "COMPLETE"
              ? "Complete"
              : upload.status === "FAILED"
                ? "Failed"
                : "Processing…"}
          </span>
        </div>
        {copy && (
          <Link
            href={`/products/new?studioId=${id}`}
            className="rounded-full bg-ink px-5 py-2 text-body-sm font-medium text-gold hover:bg-ink/90"
          >
            Use this copy →
          </Link>
        )}
      </div>

      {/* Processing state */}
      {isPolling && (
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sand border-t-gold" />
          <p className="text-body-sm text-mist">
            Luna AI is analysing your photos…
          </p>
        </div>
      )}

      {/* Failed state */}
      {upload.status === "FAILED" && (
        <div className="rounded-lg bg-coral/10 p-5">
          <p className="mb-3 text-body-sm font-medium text-coral">
            Generation failed
          </p>
          <p className="mb-4 text-body-sm text-mist">
            {errorMsg ?? "An unexpected error occurred."}
          </p>
          <Link
            href="/studio/new"
            className="text-body-sm text-gold hover:underline"
          >
            ← Try again
          </Link>
        </div>
      )}

      {/* Complete state */}
      {upload.status === "COMPLETE" && garment && copy && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_240px]">
          {/* Left: copy panel */}
          <div className="space-y-4">
            {/* Garment tags */}
            <div className="rounded-lg border border-sand bg-white p-4">
              <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
                Detected garment
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  garment.garmentType,
                  garment.color,
                  garment.fabric,
                  garment.style,
                  ...garment.details,
                ]
                  .filter(Boolean)
                  .map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-sand px-3 py-1 text-body-xs text-ink"
                    >
                      {tag}
                    </span>
                  ))}
              </div>
            </div>

            {/* English copy */}
            <div className="rounded-lg border border-sand bg-white p-4">
              <p className="mb-2 text-body-xs font-medium uppercase tracking-wide text-mist">
                English copy
              </p>
              <p className="mb-2 font-display text-body-md font-semibold text-ink">
                {copy.titleEn}
              </p>
              <p className="text-body-sm leading-relaxed text-mist">
                {copy.descriptionEn}
              </p>
              {copy.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {copy.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-sand px-2 py-0.5 text-body-xs text-mist"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Arabic copy */}
            <div
              className="rounded-lg border border-sand bg-white p-4"
              dir="rtl"
            >
              <p
                className="mb-2 text-body-xs font-medium uppercase tracking-wide text-mist"
                dir="ltr"
              >
                Arabic copy
              </p>
              <p className="mb-2 font-display text-body-md font-semibold text-ink">
                {copy.titleAr}
              </p>
              <p className="text-body-sm leading-relaxed text-mist">
                {copy.descriptionAr}
              </p>
            </div>
          </div>

          {/* Right: photos + image placeholder */}
          <div className="space-y-4">
            {/* Source photos */}
            <div className="rounded-lg border border-sand bg-white p-4">
              <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
                Source photos
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {sourceImages.slice(0, 3).map((src, i) => (
                  <div
                    key={i}
                    className="aspect-[3/4] overflow-hidden rounded bg-sand"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Source ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Image generation placeholder */}
            <div className="rounded-lg border border-sand bg-white p-4">
              <p className="mb-1 text-body-xs font-medium uppercase tracking-wide text-mist">
                AI-generated images
              </p>
              <p className="mb-3 text-body-xs text-mist">
                Coming soon — image generation will be enabled in a future
                update.
              </p>
              <div className="grid grid-cols-2 gap-1.5 opacity-30">
                <div className="aspect-[3/4] rounded bg-gold" />
                <div className="aspect-[3/4] rounded bg-gold" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
