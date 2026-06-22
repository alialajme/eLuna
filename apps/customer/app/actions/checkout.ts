"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getGateway } from "../lib/payment/factory";
import { parseCart } from "../lib/cart-utils";

const SHIPPING_THRESHOLD = 500;
const SHIPPING_FEE = 15;

export type PlaceOrderInput = {
  addressId: string;
  paymentMethod: "CARD" | "LUNA_WALLET" | "TABBY" | "TAMARA" | "CASH_ON_DELIVERY";
  notes?: string;
};

export type PlaceOrderResult =
  | { success: true; orderId: string }
  | { success: false; error: string };

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Please sign in to place an order" };

    const jar = await cookies();
    const cartItems = parseCart(jar.get("luna_cart")?.value);
    if (cartItems.length === 0) return { success: false, error: "Your bag is empty" };

    const variantIds = cartItems.map((i) => i.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: { select: { price: true, vendorId: true } } },
    });

    if (variants.length !== variantIds.length) {
      return { success: false, error: "Some items are no longer available" };
    }

    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: user.id },
    });
    if (!customerProfile) {
      customerProfile = await prisma.customerProfile.create({
        data: { userId: user.id },
      });
    }

    const address = await prisma.address.findFirst({
      where: { id: input.addressId, userId: user.id },
    });
    if (!address) return { success: false, error: "Invalid delivery address" };

    const lineItems = cartItems.map((cartItem) => {
      const variant = variants.find((v) => v.id === cartItem.variantId)!;
      const unitPrice = Number(variant.price ?? variant.product.price);
      return {
        variantId: cartItem.variantId,
        vendorId: variant.product.vendorId,
        quantity: cartItem.qty,
        unitPrice,
        lineTotal: unitPrice * cartItem.qty,
      };
    });

    const subtotal = lineItems.reduce((sum, l) => sum + l.lineTotal, 0);
    const shippingFee = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const total = subtotal + shippingFee;

    const tempOrderId = `ord_${Date.now()}`;

    const gateway = getGateway(input.paymentMethod);
    const chargeResult = await gateway.charge({
      amount: total,
      currency: "AED",
      orderId: tempOrderId,
      customerEmail: user.emailAddresses[0]?.emailAddress ?? "",
      description: `Luna order — ${lineItems.length} item(s)`,
    });

    if (!chargeResult.success) {
      return { success: false, error: chargeResult.error ?? "Payment failed" };
    }

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          customerId: customerProfile.id,
          addressId: input.addressId,
          status: "CONFIRMED",
          subtotal,
          shippingFee,
          total,
          discount: 0,
          paymentMethod: input.paymentMethod,
          notes: input.notes ?? null,
          items: {
            create: lineItems.map((l) => ({
              variantId: l.variantId,
              vendorId: l.vendorId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
            })),
          },
          paymentTransactions: {
            create: {
              method: input.paymentMethod,
              status: "CAPTURED",
              amount: total,
              currency: "AED",
              externalRef: chargeResult.externalRef,
            },
          },
        },
      });
      return created;
    });

    jar.delete("luna_cart");
    revalidatePath("/cart");
    revalidatePath("/orders");

    return { success: true, orderId: order.id };
  } catch (err) {
    console.error("[placeOrder]", err);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}
