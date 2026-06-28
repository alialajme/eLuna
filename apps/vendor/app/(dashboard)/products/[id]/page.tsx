import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";
import { ProductForm } from "../components/ProductForm";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await prisma.product
    .findUnique({ where: { id }, select: { title: true } })
    .catch(() => null);
  return { title: product ? `${product.title} — Luna Vendor` : "Edit product — Luna Vendor" };
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
  };

  return (
    <div className="max-w-4xl">
      <h2 className="font-display text-display-md text-ink mb-6">Edit product</h2>
      <ProductForm productId={product.id} initialData={initialData} />
    </div>
  );
}
