import { Metadata } from "next";
import { prisma } from "@e-luna/db";
import { getCart } from "../actions/cart";
import { CartReview } from "./CartReview";

export const metadata: Metadata = {
  title: "Your Bag — Luna",
};

export default async function CartPage() {
  const cartItems = await getCart();

  if (cartItems.length === 0) {
    return <CartReview items={[]} />;
  }

  const variantIds = cartItems.map((i) => i.variantId);

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          title: true,
          price: true,
          aiImages: true,
          vendor: { select: { storeName: true } },
        },
      },
    },
  }).catch(() => []);

  const lineItems = cartItems.flatMap((cartItem) => {
    const variant = variants.find((v) => v.id === cartItem.variantId);
    if (!variant) return [];
    const unitPrice = Number(variant.price ?? variant.product.price);
    const images = Array.isArray(variant.product.aiImages) ? variant.product.aiImages as string[] : [];
    return [{
      variantId: cartItem.variantId,
      qty: cartItem.qty,
      productId: variant.product.id,
      slug: variant.product.slug,
      title: variant.product.title,
      vendorName: variant.product.vendor.storeName,
      size: variant.size,
      color: variant.color,
      unitPrice,
      imageUrl: images[0] ?? null,
    }];
  });

  return <CartReview items={lineItems} />;
}
