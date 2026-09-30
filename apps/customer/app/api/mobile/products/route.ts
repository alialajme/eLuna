import { prisma, getCategories } from "@ayvana/db";
import { coverImage } from "../_images";

// Lightweight JSON catalog for the AYVANA native app (apps/mobile).
// Native fetch is not subject to CORS, so no extra headers are needed.
export const dynamic = "force-dynamic";

const LOW_STOCK = 3;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const [categories, products] = await Promise.all([
    getCategories(),
    prisma.product.findMany({
      where: {
        status: "ACTIVE",
        ...(category && category !== "all" ? { category } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        vendor: { select: { storeName: true } },
        variants: { select: { size: true, stock: true } },
      },
    }),
  ]);

  const items = products.map((p) => {
    const images = Array.isArray(p.aiImages) ? (p.aiImages as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const inStock = p.variants.filter((v) => v.stock > 0);
    const lowStock = inStock.length > 0 && inStock.every((v) => v.stock <= LOW_STOCK);
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      price: Number(p.price),
      compareAt: p.compareAt ? Number(p.compareAt) : null,
      image: coverImage(p.slug, images[0]),
      vendor: p.vendor.storeName,
      category: p.category,
      lowStock,
      soldOut: inStock.length === 0,
    };
  });

  return Response.json({
    categories: categories.map((c) => ({ name: c.name, slug: c.slug })),
    products: items,
  });
}
