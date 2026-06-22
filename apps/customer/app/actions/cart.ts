"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const CART_COOKIE = "luna_cart";
const MAX_ITEMS = 20;

export type CartItem = {
  variantId: string;
  qty: number;
  addedAt: string;
};

export function parseCart(raw: string | undefined): CartItem[] {
  if (!raw) return [];
  try {
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

export async function getCart(): Promise<CartItem[]> {
  const jar = await cookies();
  return parseCart(jar.get(CART_COOKIE)?.value);
}

export async function addToCart(
  variantId: string,
  qty: number = 1
): Promise<{ success: boolean; message: string }> {
  try {
    if (qty <= 0 || qty > 99) {
      return { success: false, message: "Invalid quantity" };
    }

    const jar = await cookies();
    const cart = parseCart(jar.get(CART_COOKIE)?.value);
    const existingIndex = cart.findIndex((item) => item.variantId === variantId);

    let updatedCart: CartItem[];
    if (existingIndex >= 0) {
      updatedCart = cart.map((item, i) =>
        i === existingIndex ? { ...item, qty: Math.min(item.qty + qty, 99) } : item
      );
    } else {
      if (cart.length >= MAX_ITEMS) {
        return { success: false, message: "Your bag is full (20 items max)" };
      }
      updatedCart = [...cart, { variantId, qty, addedAt: new Date().toISOString() }];
    }

    jar.set(CART_COOKIE, JSON.stringify(updatedCart), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });

    return { success: true, message: "Added to bag" };
  } catch {
    return { success: false, message: "Could not add to bag. Please try again." };
  }
}

export async function removeFromCart(
  variantId: string
): Promise<{ success: boolean }> {
  try {
    const jar = await cookies();
    const cart = parseCart(jar.get(CART_COOKIE)?.value);
    const updated = cart.filter((item) => item.variantId !== variantId);
    jar.set(CART_COOKIE, JSON.stringify(updated), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });
    revalidatePath("/cart");
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function updateCartQty(
  variantId: string,
  qty: number
): Promise<{ success: boolean }> {
  try {
    if (qty < 1 || qty > 99) return { success: false };
    const jar = await cookies();
    const cart = parseCart(jar.get(CART_COOKIE)?.value);
    const updated = cart.map((item) =>
      item.variantId === variantId ? { ...item, qty } : item
    );
    jar.set(CART_COOKIE, JSON.stringify(updated), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });
    revalidatePath("/cart");
    return { success: true };
  } catch {
    return { success: false };
  }
}
