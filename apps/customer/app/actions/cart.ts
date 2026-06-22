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
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CartItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as CartItem).variantId === "string" &&
        typeof (item as CartItem).qty === "number"
    );
  } catch {
    return [];
  }
}

export async function addToCart(
  variantId: string,
  qty: number = 1
): Promise<{ success: boolean; message: string }> {
  try {
    if (qty <= 0 || qty > 99) {
      return { success: false, message: "Invalid quantity" };
    }

    const cart = getCart();
    const existingIndex = cart.findIndex((item) => item.variantId === variantId);

    let updatedCart: CartItem[];
    if (existingIndex >= 0) {
      updatedCart = cart.map((item, i) =>
        i === existingIndex ? { ...item, qty: item.qty + qty } : item
      );
    } else {
      if (cart.length >= MAX_ITEMS) {
        return { success: false, message: "Your bag is full (20 items max)" };
      }
      updatedCart = [...cart, { variantId, qty, addedAt: new Date().toISOString() }];
    }

    (await cookies()).set(CART_COOKIE, JSON.stringify(updatedCart), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: "lax",
      httpOnly: false, // Nav needs client-side read for count badge
      secure: process.env.NODE_ENV === "production",
    });

    return { success: true, message: "Added to bag" };
  } catch {
    return { success: false, message: "Could not add to bag. Please try again." };
  }
}
