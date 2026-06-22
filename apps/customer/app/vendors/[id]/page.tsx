import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@e-luna/db";
import { FilterBar } from "@e-luna/ui";
import { currentUser } from "@clerk/nextjs/server";
import { ProductGrid, PAGE_SIZE } from "../../components/ProductGrid";
import { ProductGridSkeleton } from "../../components/ProductGridSkeleton";
import { LoadMoreButton } from "../../components/LoadMoreButton";
import type { Metadata } from "next";
import type { ProductGridFilters } from "../../components/ProductGrid";

type Props = {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
};

function getString(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val;
}

async function getVendor(id: string) {
  return prisma.vendor.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          products: { where: { status: "ACTIVE" } },
        },
      },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const vendor = await getVendor(params.id);
  if (!vendor) return { title: "Not Found" };
  return {
    title: `${vendor.storeName} — Luna`,
    description: `Shop abayas from ${vendor.storeName} on Luna`,
  };
}

export default async function VendorBoutiquePage({ params, searchParams }: Props) {
  const user = await currentUser();

  const vendor = await getVendor(params.id);

  if (!vendor || vendor.status !== "ACTIVE") notFound();

  const filters: ProductGridFilters = {
    size: getString(searchParams.size),
    fabric: getString(searchParams.fabric),
    minPrice: getString(searchParams.minPrice),
    maxPrice: getString(searchParams.maxPrice),
    sort: getString(searchParams.sort),
    page: getString(searchParams.page),
    vendorId: vendor.id,
  };

  const page = Math.max(1, Math.min(100, parseInt(filters.page ?? "1", 10) || 1));

  const [avgRating, fabrics, sizeProfile, totalCount, filteredCount] = await Promise.all([
    prisma.review.aggregate({
      where: { product: { vendorId: vendor.id } },
      _avg: { rating: true },
      _count: { rating: true },
    }),

    prisma.product.findMany({
      where: { vendorId: vendor.id, status: "ACTIVE", fabric: { not: null } },
      select: { fabric: true },
      distinct: ["fabric"],
    }).then((rows) => rows.map((r) => r.fabric!).sort()),

    user
      ? prisma.sizeProfile.findFirst({
          where: { customerProfile: { userId: user.id } },
          select: { usualSize: true },
        })
      : null,

    prisma.product.count({
      where: { vendorId: vendor.id, status: "ACTIVE" },
    }),

    prisma.product.count({
      where: {
        vendorId: params.id,
        status: "ACTIVE",
        ...(filters.size ? { variants: { some: { size: filters.size, stock: { gt: 0 } } } } : {}),
        ...(filters.fabric ? { fabric: filters.fabric } : {}),
        ...(filters.minPrice ? { price: { gte: parseFloat(filters.minPrice) } } : {}),
        ...(filters.maxPrice ? { price: { lte: parseFloat(filters.maxPrice) } } : {}),
      },
    }),
  ]);

  const joinedYear = vendor.createdAt.getFullYear();

  return (
    <div>
      {/* Boutique header */}
      <div className="bg-ink px-4 pb-8 pt-12 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-end gap-6">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-ivory/10 text-display-lg font-bold text-ivory">
              {vendor.storeName?.[0] ?? "○"}
            </div>
            <div>
              <h1 className="font-display text-display-lg text-ivory">{vendor.storeName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-body-sm text-mist">
                <span className="text-gold">{vendor._count.products} abayas</span>
                {avgRating._count.rating > 0 && (
                  <span>
                    {"★".repeat(Math.round(avgRating._avg.rating ?? 0))}
                    {"☆".repeat(5 - Math.round(avgRating._avg.rating ?? 0))}{" "}
                    {avgRating._avg.rating?.toFixed(1)} ({avgRating._count.rating} reviews)
                  </span>
                )}
                <span>Since {joinedYear}</span>
              </div>
            </div>
          </div>
          {vendor.description && (
            <p className="mt-4 max-w-2xl text-body-md text-mist/80">{vendor.description}</p>
          )}
        </div>
      </div>

      {/* Filter bar — no category filter for single vendor */}
      <FilterBar
        fabrics={fabrics}
        totalCount={totalCount}
      />

      <div className="mx-auto max-w-7xl">
        <Suspense fallback={<ProductGridSkeleton />}>
          <ProductGrid
            filters={filters}
            customerSizeProfileUsualSize={sizeProfile?.usualSize ?? null}
          />
        </Suspense>

        <div className="flex justify-center pb-10">
          <Suspense fallback={null}>
            <LoadMoreButton
              currentPage={page}
              totalCount={filteredCount}
              loadedCount={Math.min(page * PAGE_SIZE, filteredCount)}
            />
          </Suspense>
        </div>
      </div>

      {/* About section */}
      <section className="mx-auto max-w-7xl border-t border-sand px-4 py-10 md:px-6">
        <h2 className="font-display text-display-md text-ink mb-4">About {vendor.storeName}</h2>
        <p className="text-body-md text-mist max-w-2xl">
          {vendor.description ?? "This boutique is currently setting up their story. Check back soon."}
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-sand p-4 max-w-sm">
          <span className="text-gold">◑</span>
          <p className="text-body-sm text-mist">
            Standard platform return policy applies to all Luna boutiques.
          </p>
        </div>
      </section>
    </div>
  );
}
