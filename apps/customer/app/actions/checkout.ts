"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  prisma,
  getSetting,
  computeCartPricing,
  reserveStockTx,
  releaseStockTx,
  debitWalletTx,
  money,
  isDomainError,
  type DomainError,
} from "@ayvana/db";
import { safeCurrentUser } from "../lib/auth";
import { logger } from "@ayvana/observability";
import { getGateway, providerAvailable } from "@ayvana/payments";
import { parseCart } from "../lib/cart-utils";
import { hasStripe } from "@ayvana/payments";
import { StripeGateway } from "@ayvana/payments";
import { applyPaymentResult } from "@ayvana/payments";

export type PlaceOrderInput = {
  addressId: string;
  // CARD is intentionally excluded — card payments go through initiateCardPayment
  // (order-first + Stripe intent). placeOrder only handles synchronous methods.
  paymentMethod: "LUNA_WALLET" | "TABBY" | "TAMARA" | "CASH_ON_DELIVERY" | "NEOPAY";
  notes?: string;
};

export type PlaceOrderResult =
  | { success: true; orderId: string }
  | { success: false; error: string };

// Map internal domain errors to safe, customer-facing copy (never leak internals).
function friendlyDomainMessage(e: DomainError): string {
  switch (e.code) {
    case "INSUFFICIENT_INVENTORY":
      return "Sorry — one or more items just sold out. Please review your bag.";
    case "INSUFFICIENT_FUNDS":
      return "Your AYVANA Wallet balance is too low for this order.";
    default:
      return "We couldn't complete your order. Please try again.";
  }
}

type PricedLine = {
  variantId: string;
  vendorId: string;
  quantity: number;
  unitPrice: string; // Decimal serialized; authoritative price resolved server-side
};

/**
 * Resolve authoritative cart lines + Decimal pricing from the signed-in user's
 * cart cookie. Prices always come from the DB, never the client.
 */
type ResolvedCart =
  | { ok: false; error: string }
  | { ok: true; lines: PricedLine[]; pricing: ReturnType<typeof computeCartPricing> };

async function resolveCart(): Promise<ResolvedCart> {
  const jar = await cookies();
  const cartItems = parseCart(jar.get("ayvana_cart")?.value);
  if (cartItems.length === 0) return { ok: false, error: "Your bag is empty" };

  const variantIds = cartItems.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: { select: { price: true, vendorId: true } } },
  });
  if (variants.length !== variantIds.length) {
    return { ok: false, error: "Some items are no longer available" };
  }

  const lines: PricedLine[] = cartItems.map((cartItem) => {
    const variant = variants.find((v) => v.id === cartItem.variantId)!;
    return {
      variantId: cartItem.variantId,
      vendorId: variant.product.vendorId,
      quantity: cartItem.qty,
      unitPrice: (variant.price ?? variant.product.price).toString(),
    };
  });

  const threshold = await getSetting("free_shipping_threshold");
  const fee = await getSetting("shipping_fee");
  const pricing = computeCartPricing(
    lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity })),
    { freeShippingThreshold: threshold, shippingFee: fee },
  );

  return { ok: true, lines, pricing };
}

function orderItemsCreate(lines: PricedLine[]) {
  return lines.map((l) => ({
    variantId: l.variantId,
    vendorId: l.vendorId,
    quantity: l.quantity,
    unitPrice: money(l.unitPrice),
  }));
}

function stockLines(lines: PricedLine[]) {
  return lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
}

async function clearCartAndRevalidate() {
  const jar = await cookies();
  jar.delete("ayvana_cart");
  revalidatePath("/cart");
  revalidatePath("/orders");
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  try {
    // Defensive guard for untyped/direct callers: card payments must use the
    // order-first Stripe flow, never this synchronous path.
    if ((input.paymentMethod as string) === "CARD") {
      return { success: false, error: "Card payments must be completed through the card checkout flow." };
    }
    // Authoritative server-side allowlist: never trust the client picker. Synchronous internal methods are
    // always allowed; external providers only when their real gateway is live (or non-prod). This prevents a
    // crafted request selecting an unconfigured provider whose Simulated fallback would "capture" for free.
    const SYNCHRONOUS_METHODS = ["LUNA_WALLET", "CASH_ON_DELIVERY"];
    if (!SYNCHRONOUS_METHODS.includes(input.paymentMethod) && !providerAvailable(input.paymentMethod)) {
      return { success: false, error: "That payment method is not available." };
    }

    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Please sign in to place an order" };

    let customerProfile = await prisma.customerProfile.findUnique({ where: { userId: user.id } });
    if (!customerProfile) {
      customerProfile = await prisma.customerProfile.create({ data: { userId: user.id } });
    }

    const address = await prisma.address.findFirst({
      where: { id: input.addressId, userId: user.id },
    });
    if (!address) return { success: false, error: "Invalid delivery address" };

    const cart = await resolveCart();
    if (!cart.ok) return { success: false, error: cart.error };
    const { lines, pricing } = cart;

    const commonOrderData = {
      customerId: customerProfile.id,
      addressId: input.addressId,
      subtotal: pricing.subtotal,
      shippingFee: pricing.shippingFee,
      total: pricing.total,
      discount: money(0),
      paymentMethod: input.paymentMethod,
      notes: input.notes ?? null,
    };

    // ── LUNA WALLET ── atomic: reserve stock + create CONFIRMED order + debit wallet (with ledger).
    if (input.paymentMethod === "LUNA_WALLET") {
      const order = await prisma.$transaction(async (tx) => {
        await reserveStockTx(tx, stockLines(lines));
        const created = await tx.order.create({
          data: {
            ...commonOrderData,
            status: "CONFIRMED",
            items: { create: orderItemsCreate(lines) },
            paymentTransactions: {
              create: { method: "LUNA_WALLET", status: "CAPTURED", amount: pricing.total, currency: "AED" },
            },
          },
        });
        await debitWalletTx(tx, {
          customerProfileId: customerProfile!.id,
          amount: pricing.total,
          orderId: created.id,
          note: "AYVANA Wallet checkout",
        });
        return created;
      });
      await clearCartAndRevalidate();
      return { success: true, orderId: order.id };
    }

    // ── CASH ON DELIVERY ── order CONFIRMED, but payment stays PENDING until cash is collected.
    if (input.paymentMethod === "CASH_ON_DELIVERY") {
      const order = await prisma.$transaction(async (tx) => {
        await reserveStockTx(tx, stockLines(lines));
        return tx.order.create({
          data: {
            ...commonOrderData,
            status: "CONFIRMED",
            items: { create: orderItemsCreate(lines) },
            paymentTransactions: {
              create: { method: "CASH_ON_DELIVERY", status: "PENDING", amount: pricing.total, currency: "AED" },
            },
          },
        });
      });
      await clearCartAndRevalidate();
      return { success: true, orderId: order.id };
    }

    // ── EXTERNAL PROVIDERS (TABBY / TAMARA / NEOPAY) ── order-first: reserve stock + PENDING order,
    // then call the gateway. Release stock and cancel if the payment is not captured.
    const order = await prisma.$transaction(async (tx) => {
      await reserveStockTx(tx, stockLines(lines));
      return tx.order.create({
        data: {
          ...commonOrderData,
          status: "PENDING",
          items: { create: orderItemsCreate(lines) },
          paymentTransactions: {
            create: { method: input.paymentMethod, status: "PENDING", amount: pricing.total, currency: "AED" },
          },
        },
      });
    });

    const gateway = getGateway(input.paymentMethod);
    const paymentResult = await gateway.createPayment({
      amount: Number(pricing.total),
      currency: "AED",
      orderId: order.id,
      customerEmail: user.emailAddresses[0]?.emailAddress ?? "",
      description: `AYVANA order — ${lines.length} item(s)`,
    });

    if (paymentResult.status === "captured") {
      await prisma.$transaction([
        prisma.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" } }),
        prisma.paymentTransaction.updateMany({
          where: { orderId: order.id, status: "PENDING" },
          data: { status: "CAPTURED", externalRef: paymentResult.externalRef },
        }),
      ]);
      await clearCartAndRevalidate();
      return { success: true, orderId: order.id };
    }

    // Not captured — release the reservation and cancel the order.
    await prisma.$transaction(async (tx) => {
      await releaseStockTx(tx, stockLines(lines));
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
      await tx.paymentTransaction.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "FAILED" },
      });
    });
    return {
      success: false,
      error:
        paymentResult.status === "failed"
          ? paymentResult.error
          : "This payment method must be completed through the card checkout flow.",
    };
  } catch (err) {
    if (isDomainError(err)) {
      logger.warn("placeOrder domain error", { action: "placeOrder", code: err.code });
      return { success: false, error: friendlyDomainMessage(err) };
    }
    logger.error("placeOrder failed", { action: "placeOrder", err: String(err) });
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

    let customerProfile = await prisma.customerProfile.findUnique({ where: { userId: user.id } });
    if (!customerProfile) {
      customerProfile = await prisma.customerProfile.create({ data: { userId: user.id } });
    }

    const address = await prisma.address.findFirst({
      where: { id: input.addressId, userId: user.id },
    });
    if (!address) return { success: false, error: "Invalid delivery address" };

    const cart = await resolveCart();
    if (!cart.ok) return { success: false, error: cart.error };
    const { lines, pricing } = cart;

    // 1) Reserve stock + create the PENDING order + PENDING transaction atomically (audit anchor).
    const order = await prisma.$transaction(async (tx) => {
      await reserveStockTx(tx, stockLines(lines));
      return tx.order.create({
        data: {
          customerId: customerProfile!.id,
          addressId: input.addressId,
          status: "PENDING",
          subtotal: pricing.subtotal,
          shippingFee: pricing.shippingFee,
          total: pricing.total,
          discount: money(0),
          paymentMethod: "CARD",
          notes: input.notes ?? null,
          items: { create: orderItemsCreate(lines) },
          paymentTransactions: {
            create: { method: "CARD", status: "PENDING", amount: pricing.total, currency: "AED" },
          },
        },
        include: { paymentTransactions: { select: { id: true }, take: 1 } },
      });
    });

    // 2) Create the gateway payment.
    const gateway = getGateway("CARD");
    const result = await gateway.createPayment({
      amount: Number(pricing.total),
      currency: "AED",
      orderId: order.id,
      customerEmail: user.emailAddresses[0]?.emailAddress ?? "",
      description: `AYVANA order — ${lines.length} item(s)`,
      metadata: { orderId: order.id },
    });

    if (result.status === "failed") {
      // Release the reservation — the order never became payable.
      await prisma.$transaction(async (tx) => {
        await releaseStockTx(tx, stockLines(lines));
        await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
        await tx.paymentTransaction.updateMany({
          where: { orderId: order.id, status: "PENDING" },
          data: { status: "FAILED" },
        });
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
      await clearCartAndRevalidate();
      return { success: true, orderId: order.id, captured: true };
    }

    // Live Stripe: hand the client secret back for the Payment Element.
    return { success: true, orderId: order.id, clientSecret: result.clientSecret };
  } catch (err) {
    if (isDomainError(err)) {
      logger.warn("initiateCardPayment domain error", { action: "initiateCardPayment", code: err.code });
      return {
        success: false,
        error:
          err.code === "INSUFFICIENT_INVENTORY"
            ? "Sorry — one or more items just sold out. Please review your bag."
            : "We couldn't start your payment. Please try again.",
      };
    }
    logger.error("initiateCardPayment failed", { action: "initiateCardPayment", err: String(err) });
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
      await clearCartAndRevalidate();
    }
    return { status: updated?.status ?? order.status };
  } catch (err) {
    logger.error("syncOrderPayment failed", { action: "syncOrderPayment", orderId, err: String(err) });
    return { status: "ERROR" };
  }
}
