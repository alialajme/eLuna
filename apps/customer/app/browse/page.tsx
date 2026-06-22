import { Suspense } from "react";
import { prisma } from "@e-luna/db";
import { Decimal } from "@prisma/client/runtime/library";
import { FilterBar } from "@e-luna/ui";
import { currentUser } from "@clerk/nextjs/server";
import { ProductGrid } from "../components/ProductGrid";
import { ProductGridSkeleton } from "../components/ProductGridSkeleton";
import { LoadMoreButton } from "../components/LoadMoreButton";
import type { ProductGridFilters } from "../components/ProductGrid";

type BrowsePageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

function getString(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val;
}

export const metadata = {
  title: "Browse Abayas — Luna",
  description: "Discover hundreds of abayas from Gulf boutiques",
};

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const user = await currentUser();

  const filters: ProductGridFilters = {
    category: getString(searchParams.category),
    size: getString(searchParams.size),
    fabric: getString(searchParams.fabric),
    minPrice: getString(searchParams.minPrice),
    maxPrice: getString(searchParams.maxPrice),
    sort: getString(searchParams.sort),
    q: getString(searchParams.q),
    page: getString(searchParams.page),
  };

  // Build filters for filtered count query
  const filterWhere = {
    status: "ACTIVE" as const,
    ...(filters.category && { category: { equals: filters.category, mode: "insensitive" as const } }),
    ...(filters.fabric && { fabric: { equals: filters.fabric, mode: "insensitive" as const } }),
    ...(filters.size && { variants: { some: { size: { equals: filters.size }, stock: { gt: 0 } } } }),
    ...(filters.minPrice && { price: { gte: new Decimal(filters.minPrice) } }),
    ...(filters.maxPrice && { price: { lte: new Decimal(filters.maxPrice) } }),
    ...(filters.q && {
      OR: [
        { title: { contains: filters.q, mode: "insensitive" as const } },
        { fabric: { contains: filters.q, mode: "insensitive" as const } },
        { description: { contains: filters.q, mode: "insensitive" as const } },
        { vendor: { storeName: { contains: filters.q, mode: "insensitive" as const } } },
      ],
    }),
  };

  const [categories, fabrics, sizeProfile, filteredCount, allActiveCount] = await Promise.all([
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      select: { category: true },
      distinct: ["category"],
    }).then((rows) => rows.map((r) => r.category).sort()),

    prisma.product.findMany({
      where: { status: "ACTIVE", fabric: { not: null } },
      select: { fabric: true },
      distinct: ["fabric"],
    }).then((rows) => rows.map((r) => r.fabric!).sort()),

    user
      ? prisma.sizeProfile.findFirst({
          where: { customerProfile: { userId: user.id } },
          select: { usualSize: true },
        })
      : null,

    prisma.product.count({ where: filterWhere }),

    prisma.product.count({ where: { status: "ACTIVE" } }),
  ]);

  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const loadedCount = Math.min(page * 12, filteredCount);

  return (
    <div>
      {filters.q && (
        <div className="bg-sand px-4 py-3 text-body-md text-ink">
          Results for <strong>"{filters.q}"</strong>
        </div>
      )}

      <FilterBar
        categories={categories}
        fabrics={fabrics}
        totalCount={allActiveCount}
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
              loadedCount={loadedCount}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
