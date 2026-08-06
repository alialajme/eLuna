import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma, type ProductStatus } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { StatusFilter } from "../components/StatusFilter";
import { ProductActions } from "../components/ProductActions";

export const metadata: Metadata = { title: "Products — Luna Ops" };

const PRODUCT_STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-sage/20 text-sage",
  DRAFT: "bg-gold/20 text-gold",
  REJECTED: "bg-coral/20 text-coral",
  ARCHIVED: "bg-sand text-mist",
};

const PRODUCT_FILTERS = [
  { label: "All", value: "all" },
  { label: "Draft", value: "DRAFT" },
  { label: "Active", value: "ACTIVE" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Archived", value: "ARCHIVED" },
];

const VALID: ProductStatus[] = ["DRAFT", "ACTIVE", "REJECTED", "ARCHIVED"];

type Props = { searchParams: Promise<{ status?: string }> };

export default async function ProductsPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const raw = (await searchParams).status ?? "all";
  const where = VALID.includes(raw as ProductStatus)
    ? { status: raw as ProductStatus }
    : {};

  const products = await prisma.product
    .findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { vendor: { select: { storeName: true } } },
    })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Products</h2>

      <StatusFilter status={raw} options={PRODUCT_FILTERS} />

      {products.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">No products found for this filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {products.map((product) => {
            const imgs = product.aiImages as string[];
            const thumb = Array.isArray(imgs) ? imgs[0] : undefined;

            return (
              <div
                key={product.id}
                className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-sand">
                  {thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt={product.title}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="truncate text-body-sm font-medium text-ink">
                    {product.title}
                  </p>
                  <p className="text-body-xs text-mist">
                    {product.vendor.storeName} · {product.category}
                  </p>
                </div>

                <p className="shrink-0 text-body-sm text-ink">
                  AED {Number(product.price).toLocaleString("en-AE", { maximumFractionDigits: 0 })}
                </p>

                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${PRODUCT_STATUS_BADGE[product.status] ?? "bg-sand text-mist"}`}
                >
                  {product.status.charAt(0) + product.status.slice(1).toLowerCase()}
                </span>

                <ProductActions productId={product.id} status={product.status} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
