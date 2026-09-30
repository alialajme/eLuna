import { prisma } from "@ayvana/db";
import { resolveMobileCustomer } from "../_customer";
import { coverImage } from "../_images";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await resolveMobileCustomer();
  if (!customer) return Response.json({ orders: [] });

  const orders = await prisma.order.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      items: {
        include: { variant: { include: { product: { select: { slug: true, title: true, aiImages: true } } } } },
      },
    },
  });

  return Response.json({
    orders: orders.map((o) => {
      const first = o.items[0]?.variant.product;
      const imgs = first && Array.isArray(first.aiImages) ? (first.aiImages as unknown[]) : [];
      const firstImg = typeof imgs[0] === "string" ? (imgs[0] as string) : null;
      const itemCount = o.items.reduce((n, it) => n + it.quantity, 0);
      return {
        id: o.id,
        reference: o.id.slice(-6).toUpperCase(),
        createdAt: o.createdAt,
        status: o.status,
        total: Number(o.total),
        itemCount,
        title: first?.title ?? "Order",
        cover: first ? coverImage(first.slug, firstImg) : null,
      };
    }),
  });
}
