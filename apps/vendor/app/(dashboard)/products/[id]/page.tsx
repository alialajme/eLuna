import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, getCategories } from "@ayvana/db";
import { listSessionsForProduct } from "@ayvana/studio";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";
import { ProductForm } from "../components/ProductForm";
import type { SizeGuideEntry } from "../../../actions/product";

const SHOOT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  RUNNING: "In progress",
  PREVIEW: "Ready",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  REVIEW_REQUIRED: "In review",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await prisma.product
    .findUnique({ where: { id }, select: { title: true } })
    .catch(() => null);
  return { title: product ? `${product.title} — AYVANA Vendor` : "Edit product — AYVANA Vendor" };
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const product = await prisma.product
    .findUnique({
      where: { id },
      include: {
        variants: {
          include: { _count: { select: { orderItems: true } } },
        },
      },
    })
    .catch(() => null);

  if (!product || product.vendorId !== vendor.id) {
    redirect("/products");
  }

  const initialData = {
    title: product.title,
    description: product.description ?? "",
    category: product.category,
    fabric: product.fabric ?? "",
    careGuide: product.careGuide ?? "",
    images: (product.aiImages as string[]) ?? [],
    price: Number(product.price),
    compareAt: product.compareAt ? Number(product.compareAt) : undefined,
    status: product.status as "DRAFT" | "ACTIVE" | "ARCHIVED",
    variants: product.variants.map((v) => ({
      size: v.size,
      color: v.color,
      stock: v.stock,
      price: v.price ? Number(v.price) : undefined,
      hasOrders: v._count.orderItems > 0,
    })),
    sizeGuide: Array.isArray((product.sizeGuide as { entries?: unknown } | null)?.entries)
      ? ((product.sizeGuide as { entries: SizeGuideEntry[] }).entries)
      : undefined,
    dropshipSupplierId: product.dropshipSupplierId,
  };

  const [categories, suppliers, shoots] = await Promise.all([
    getCategories(),
    prisma.supplier
      .findMany({ where: { status: "ACTIVE" }, select: { id: true, companyName: true }, orderBy: { companyName: "asc" } })
      .catch(() => []),
    listSessionsForProduct(product.id, vendor.id),
  ]);

  return (
    <div className="max-w-4xl">
      <h2 className="font-display text-display-md text-ink mb-6">Edit product</h2>
      <ProductForm productId={product.id} initialData={initialData} categories={categories} suppliers={suppliers} />

      {shoots.length > 0 && (
        <section className="mt-8 rounded-lg border border-sand bg-ivory p-5">
          <h3 className="font-display text-display-sm text-ink">AI Studio shoots</h3>
          <p className="mt-1 text-body-sm text-mist">Shoots generated for this product.</p>
          <ul className="mt-4 flex flex-col gap-2">
            {shoots.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/studio/${s.id}`}
                  className="flex items-center gap-3 rounded-md border border-sand bg-white px-4 py-3 transition-colors hover:border-gold/60"
                >
                  <span className="flex-1 text-body-sm text-ink">
                    {new Date(s.createdAt).toLocaleDateString("en-AE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="text-body-xs text-mist">{SHOOT_STATUS_LABEL[s.status] ?? s.status}</span>
                  <span className="text-body-sm text-gold">View</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
