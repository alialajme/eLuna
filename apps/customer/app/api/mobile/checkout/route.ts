import { prisma } from "@ayvana/db";
import { resolveMobileCustomer } from "../_customer";

export const dynamic = "force-dynamic";

type Line = { slug: string; size: string; qty: number };

// Simulated guest checkout: places a real Order (cash on delivery) for the demo
// customer. No card is charged — real payment/auth need keys not present here.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { items?: Line[]; address?: Record<string, string> }
    | null;

  const items = body?.items ?? [];
  const a = body?.address ?? {};
  if (items.length === 0) return Response.json({ error: "Your bag is empty." }, { status: 400 });
  for (const f of ["fullName", "phone", "addressLine1", "city"] as const) {
    if (!a[f]?.trim()) return Response.json({ error: `Missing ${f}` }, { status: 400 });
  }

  const customer = await resolveMobileCustomer();
  if (!customer) return Response.json({ error: "No customer profile available." }, { status: 404 });

  // Resolve each line to a concrete variant + price.
  const orderItems: { variantId: string; vendorId: string; quantity: number; unitPrice: number }[] = [];
  let subtotal = 0;
  for (const line of items) {
    const product = await prisma.product.findUnique({
      where: { slug: line.slug },
      include: { variants: true },
    });
    if (!product || product.status !== "ACTIVE") continue;
    const variant = product.variants.find((v) => v.size === line.size && v.stock > 0);
    if (!variant) continue;
    const qty = Math.max(1, Math.min(Number(line.qty) || 1, variant.stock));
    const unitPrice = Number(variant.price ?? product.price);
    subtotal += unitPrice * qty;
    orderItems.push({ variantId: variant.id, vendorId: product.vendorId, quantity: qty, unitPrice });
  }
  if (orderItems.length === 0) return Response.json({ error: "No purchasable items." }, { status: 400 });

  const address = await prisma.address.create({
    data: {
      userId: customer.userId,
      label: "Mobile",
      fullName: a.fullName!.trim(),
      phone: a.phone!.trim(),
      addressLine1: a.addressLine1!.trim(),
      addressLine2: a.addressLine2?.trim() || null,
      city: a.city!.trim(),
      emirate: a.emirate?.trim() || null,
      country: "AE",
    },
  });

  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      addressId: address.id,
      status: "CONFIRMED",
      subtotal,
      shippingFee: 0,
      total: subtotal,
      paymentMethod: "CASH_ON_DELIVERY",
      items: { create: orderItems },
    },
  });

  return Response.json({ orderId: order.id, total: subtotal });
}
