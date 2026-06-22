import { redirect } from "next/navigation";
import { Metadata } from "next";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getCart } from "../actions/cart";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = {
  title: "Checkout — Luna",
};

const SHIPPING_THRESHOLD = 500;
const SHIPPING_FEE = 15;

export default async function CheckoutPage() {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="font-display text-display-md text-ink mb-4">Sign in to checkout</p>
        <p className="text-body-md text-mist mb-6">You need an account to place an order.</p>
        <a
          href="/sign-in"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors"
        >
          Sign in
        </a>
      </div>
    );
  }

  const cartItems = await getCart();
  if (cartItems.length === 0) redirect("/cart");

  const variantIds = cartItems.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: { select: { price: true } } },
  }).catch(() => []);

  const subtotal = cartItems.reduce((sum, item) => {
    const variant = variants.find((v) => v.id === item.variantId);
    if (!variant) return sum;
    return sum + Number(variant.price ?? variant.product.price) * item.qty;
  }, 0);

  const shippingFee = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal + shippingFee;
  const itemCount = cartItems.reduce((sum, i) => sum + i.qty, 0);

  const addresses = await prisma.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  }).catch(() => []);

  return (
    <CheckoutForm
      addresses={addresses}
      cartSubtotal={subtotal}
      shippingFee={shippingFee}
      cartTotal={total}
      itemCount={itemCount}
    />
  );
}
