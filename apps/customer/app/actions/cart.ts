"use server";

import { cookies } from "next/headers";

const CART_COOKIE = "luna_cart";
const MAX_ITEMS = 20;

export type CartItem = {
  variantId: string;
  qty: number;
  addedAt: string;
};

export function getCart(): CartItem[] {
  try {
    const raw = cookies().get(CART_COOKIE)?.value;
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}

export async function addToCart(
  variantId: string,
  qty: number = 1
): Promise<{ success: boolean; message: string }> {
  try {
    const cart = getCart();
    const existing = cart.find((item) => item.variantId === variantId);

    if (existing) {
      existing.qty += qty;
    } else {
      if (cart.length >= MAX_ITEMS) {
        return { success: false, message: "Your bag is full (20 items max)" };
      }
      cart.push({ variantId, qty, addedAt: new Date().toISOString() });
    }

    (await cookies()).set(CART_COOKIE, JSON.stringify(cart), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: "lax",
      httpOnly: false, // Nav needs client-side read for count badge
    });

    return { success: true, message: "Added to bag" };
  } catch {
    return { success: false, message: "Could not add to bag. Please try again." };
  }
}
