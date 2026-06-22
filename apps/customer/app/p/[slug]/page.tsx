import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { prisma } from "@e-luna/db";
import { ProductCard } from "@e-luna/ui";
import { safeCurrentUser as currentUser } from "../../lib/auth";
import { ProductDetail } from "./ProductDetail";
import type { Metadata } from "next";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { vendor: { select: { storeName: true } } },
  }).catch(() => null);
  if (!product) return { title: "Not Found" };
  return {
    title: `${product.title} — ${product.vendor.storeName} on Luna`,
    description: product.description ?? undefined,
  };
}

const SizeGuideSchema = z.object({
  entries: z.array(z.object({
    size: z.string(),
    bust: z.tuple([z.number(), z.number()]),
    waist: z.tuple([z.number(), z.number()]),
    hip: z.tuple([z.number(), z.number()]),
    length: z.number(),
  })),
});

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];

export default async function ProductDetailPage({ params }: Props) {
  const [{ slug }, user] = await Promise.all([params, currentUser()]);

  const [product, sizeProfile] = await Promise.all([
    prisma.product.findUnique({
      where: { slug },
      include: {
        vendor: { select: { id: true, storeName: true } },
        variants: { select: { id: true, size: true, color: true, stock: true } },
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { customerProfile: { select: { user: { select: { email: true } } } } },
        },
        _count: { select: { reviews: true } },
      },
    }).catch(() => null),
    user
      ? prisma.sizeProfile.findFirst({
          where: { customerProfile: { userId: user.id } },
          select: { bust: true, usualSize: true, fitPreference: true },
        }).catch(() => null)
      : null,
  ]);

  if (!product || product.status !== "ACTIVE") notFound();

  const avgRating =
    product.reviews.length > 0
      ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length
      : null;

  const guideParsed = SizeGuideSchema.safeParse(product.sizeGuide);
  const guide = guideParsed.success ? guideParsed.data : null;

  let recommendedSize: string | null = null;
  if (sizeProfile?.bust) {
    const match = guide?.entries?.find(
      (e) => sizeProfile.bust! >= e.bust[0] && sizeProfile.bust! < e.bust[1]
    );
    if (match) {
      recommendedSize = match.size;
      if (sizeProfile.fitPreference === "LOOSE" || sizeProfile.fitPreference === "OVERSIZED") {
        const idx = SIZE_ORDER.indexOf(match.size);
        if (idx >= 0 && idx < SIZE_ORDER.length - 1) recommendedSize = SIZE_ORDER[idx + 1];
      }
    }
  }

  const moreFromVendor = await prisma.product.findMany({
    where: { vendorId: product.vendorId, status: "ACTIVE", id: { not: product.id } },
    take: 4,
    orderBy: { createdAt: "desc" },
    include: { vendor: { select: { storeName: true } } },
  }).catch(() => []);

  const images = Array.isArray(product.aiImages)
    ? (product.aiImages as string[])
    : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-body-sm text-mist">
        <Link href="/browse" className="hover:text-gold transition-colors">Browse</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/browse?category=${product.category}`} className="hover:text-gold transition-colors">
          {product.category}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink truncate">{product.title}</span>
      </nav>

      {/* Vendor badge */}
      <Link
        href={`/vendors/${product.vendor.id}`}
        className="mb-4 inline-flex items-center gap-1 rounded-full border border-sand px-3 py-1 text-body-sm text-mist hover:border-gold hover:text-gold transition-colors"
      >
        {product.vendor.storeName} →
      </Link>

      {/* Main product detail (client island) */}
      <ProductDetail
        images={images}
        title={product.title}
        price={Number(product.price)}
        fabric={product.fabric}
        sizeGuide={guide}
        variants={product.variants}
        sizeProfile={sizeProfile ?? null}
        recommendedSize={recommendedSize}
      />

      {/* Reviews */}
      {product._count.reviews > 0 && (
        <section className="mt-16 border-t border-sand pt-10">
          <div className="mb-6 flex items-center gap-4">
            <h2 className="font-display text-display-md text-ink">Reviews</h2>
            {avgRating !== null && (
              <span className="text-body-md text-mist">
                {"★".repeat(Math.round(avgRating))}{"☆".repeat(5 - Math.round(avgRating))}{" "}
                {avgRating.toFixed(1)} ({product._count.reviews})
              </span>
            )}
          </div>
          <div className="space-y-6">
            {product.reviews.map((review) => (
              <div key={review.id} className="border-b border-sand pb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-body-sm font-medium text-ink">
                    {review.customerProfile.user.email.split("@")[0] || review.customerProfile.user.email}
                  </span>
                  <span className="text-body-sm text-gold">
                    {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                  </span>
                </div>
                {review.body && <p className="text-body-md text-mist">{review.body}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* More from vendor */}
      {moreFromVendor.length > 0 && (
        <section className="mt-16 border-t border-sand pt-10">
          <h2 className="font-display text-display-md text-ink mb-6">
            More from {product.vendor.storeName}
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {moreFromVendor.map((p) => {
              const img = Array.isArray(p.aiImages) && typeof p.aiImages[0] === "string"
                ? p.aiImages[0]
                : null;
              return (
                <Link key={p.id} href={`/p/${p.slug}`}>
                  <ProductCard
                    id={p.id}
                    title={p.title}
                    price={Number(p.price)}
                    imageUrl={img}
                    vendorName={p.vendor.storeName}
                  />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
