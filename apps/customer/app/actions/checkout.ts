"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getGateway } from "../lib/payment/factory";
import { parseCart } from "../lib/cart-utils";
import { hasStripe } from "../lib/payment/config";
import { StripeGateway } from "../lib/payment/stripe";
import { applyPaymentResult } from "../lib/payment/reconcile";

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
    const paymentResult = await gateway.createPayment({
      amount: total,
      currency: "AED",
      orderId: tempOrderId,
      customerEmail: user.emailAddresses[0]?.emailAddress ?? "",
      description: `Luna order — ${lineItems.length} item(s)`,
    });

    if (paymentResult.status !== "captured") {
      return {
        success: false,
        error:
          paymentResult.status === "failed"
            ? paymentResult.error
            : "This payment method must be completed through the card checkout flow.",
      };
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
              externalRef: paymentResult.externalRef,
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

export type InitiateCardResult =
  | { success: true; orderId: string; clientSecret?: string; captured?: boolean }
  | { success: false; error: string };

export async function initiateCardPayment(input: {
  addressId: string;
  notes?: string;
}): Promise<InitiateCardResult> {
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

    let customerProfile = await prisma.customerProfile.findUnique({ where: { userId: user.id } });
    if (!customerProfile) {
      customerProfile = await prisma.customerProfile.create({ data: { userId: user.id } });
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
      };
    });
    const subtotal = lineItems.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    const shippingFee = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const total = subtotal + shippingFee;

    // 1) Create the PENDING order + PENDING transaction up front (audit anchor).
    const order = await prisma.order.create({
      data: {
        customerId: customerProfile.id,
        addressId: input.addressId,
        status: "PENDING",
        subtotal,
        shippingFee,
        total,
        discount: 0,
        paymentMethod: "CARD",
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
          create: { method: "CARD", status: "PENDING", amount: total, currency: "AED" },
        },
      },
      include: { paymentTransactions: { select: { id: true }, take: 1 } },
    });

    // 2) Create the gateway payment.
    const gateway = getGateway("CARD");
    const result = await gateway.createPayment({
      amount: total,
      currency: "AED",
      orderId: order.id,
      customerEmail: user.emailAddresses[0]?.emailAddress ?? "",
      description: `Luna order — ${lineItems.length} item(s)`,
      metadata: { orderId: order.id },
    });

    if (result.status === "failed") {
      await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
      await prisma.paymentTransaction.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "FAILED" },
      });
      return { success: false, error: result.error };
    }

    // Persist externalRef on the pending transaction.
    const txId = order.paymentTransactions[0]?.id;
    if (txId) {
      await prisma.paymentTransaction.update({
        where: { id: txId },
        data: { externalRef: result.externalRef },
      });
    }

    // Simulated fallback (no Stripe keys): capture immediately, confirm, clear cart.
    if (result.status === "captured") {
      await applyPaymentResult({
        kind: "payment_succeeded",
        orderId: order.id,
        externalRef: result.externalRef,
      });
      jar.delete("luna_cart");
      revalidatePath("/cart");
      revalidatePath("/orders");
      return { success: true, orderId: order.id, captured: true };
    }

    // Live Stripe: hand the client secret back for the Payment Element.
    return { success: true, orderId: order.id, clientSecret: result.clientSecret };
  } catch (err) {
    console.error("[initiateCardPayment]", err);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function syncOrderPayment(orderId: string): Promise<{ status: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { status: "UNAUTHORIZED" };

    const profile = await prisma.customerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) return { status: "FORBIDDEN" };

    const order = await prisma.order.findFirst({
      where: { id: orderId, customerId: profile.id },
      select: { id: true, status: true, paymentTransactions: { select: { externalRef: true }, take: 1 } },
    });
    if (!order) return { status: "NOT_FOUND" };
    if (order.status !== "PENDING") return { status: order.status };
    if (!hasStripe()) return { status: order.status };

    const ref = order.paymentTransactions[0]?.externalRef;
    if (!ref) return { status: order.status };

    const result = await new StripeGateway().retrievePayment(ref);
    await applyPaymentResult(result);

    const updated = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (updated?.status === "CONFIRMED") {
      const jar = await cookies();
      jar.delete("luna_cart");
      revalidatePath("/cart");
      revalidatePath("/orders");
    }
    return { status: updated?.status ?? order.status };
  } catch (err) {
    console.error("[syncOrderPayment]", err);
    return { status: "ERROR" };
  }
}
