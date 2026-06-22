import { prisma } from "@e-luna/db";
import { Decimal } from "@prisma/client/runtime/library";
import { ProductCard } from "@e-luna/ui";
import Link from "next/link";

export type ProductGridFilters = {
  category?: string;
  size?: string;
  fabric?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  q?: string;
  vendorId?: string;
  page?: string;
};

type Props = {
  filters: ProductGridFilters;
  customerSizeProfileUsualSize?: string | null;
};

export const PAGE_SIZE = 12;

const SORT_MAP = {
  newest: { createdAt: "desc" as const },
  "price-asc": { price: "asc" as const },
  "price-desc": { price: "desc" as const },
  rating: { reviews: { _count: "desc" as const } },
} as const;

export async function ProductGrid({ filters, customerSizeProfileUsualSize }: Props) {
  const page = Math.max(1, Math.min(100, parseInt(filters.page ?? "1", 10) || 1));
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    status: "ACTIVE" as const,
    ...(filters.vendorId && { vendorId: filters.vendorId }),
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

  const orderBy = SORT_MAP[filters.sort ?? "newest"] ?? { createdAt: "desc" };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take: PAGE_SIZE,
      include: {
        vendor: { select: { storeName: true, id: true } },
        variants: { select: { size: true, stock: true } },
        _count: { select: { reviews: true } },
      },
    }).catch(() => []),
    prisma.product.count({ where }).catch(() => 0),
  ]);

  if (products.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="text-body-lg text-ink mb-2">No abayas found</p>
        <p className="text-body-md text-mist mb-6">Luna hasn't found a match — try asking her</p>
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors"
        >
          <span className="text-gold">◑</span> Chat with Luna
        </Link>
      </div>
    );
  }

  const hasMore = skip + products.length < total;

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 px-4 py-6">
        {products.map((product) => {
          const firstImage = Array.isArray(product.aiImages) && typeof product.aiImages[0] === "string"
  ? product.aiImages[0]
  : null;
          const lowStockInYourSize =
            customerSizeProfileUsualSize &&
            product.variants.some(
              (v) => v.size === customerSizeProfileUsualSize && v.stock > 0 && v.stock <= 3
            );

          return (
            <Link key={product.id} href={`/p/${product.slug}`} className="block">
              <div className="relative">
                <ProductCard
                  id={product.id}
                  title={product.title}
                  price={Number(product.price)}
                  imageUrl={firstImage}
                  vendorName={product.vendor.storeName}
                />
                {lowStockInYourSize && (
                  <span className="absolute bottom-14 left-2 rounded bg-coral px-2 py-0.5 text-label text-ivory">
                    Low stock in your size
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {hasMore && (
        <div className="flex justify-center pb-8">
          <div data-page={page} data-total={total} data-loaded={skip + products.length} />
        </div>
      )}
    </div>
  );
}
