import { prisma } from "@ayvana/db";
import { galleryImages } from "../../_images";

// Full product detail for the AYVANA native app (apps/mobile).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const p = await prisma.product.findUnique({
    where: { slug },
    include: {
      vendor: { select: { id: true, storeName: true } },
      variants: { select: { id: true, size: true, color: true, stock: true }, orderBy: { size: "asc" } },
    },
  });

  if (!p || p.status !== "ACTIVE") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const images = Array.isArray(p.aiImages)
    ? (p.aiImages as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  return Response.json({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    price: Number(p.price),
    compareAt: p.compareAt ? Number(p.compareAt) : null,
    category: p.category,
    fabric: p.fabric,
    careGuide: p.careGuide,
    images: galleryImages(p.slug, images, 3),
    vendor: { id: p.vendor.id, name: p.vendor.storeName },
    variants: p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, stock: v.stock })),
  });
}
