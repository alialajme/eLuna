"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";

export async function toggleWishlist(
  productId: string
): Promise<{ wishlisted: boolean; error?: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { wishlisted: false, error: "Sign in to save items" };

    let profile = await prisma.customerProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      profile = await prisma.customerProfile.create({
        data: { userId: user.id },
      });
    }

    const existing = await prisma.wishlist.findUnique({
      where: {
        customerProfileId_productId: {
          customerProfileId: profile.id,
          productId,
        },
      },
    });

    if (existing) {
      await prisma.wishlist.delete({ where: { id: existing.id } });
      revalidatePath("/wishlist");
      return { wishlisted: false };
    } else {
      await prisma.wishlist.create({
        data: { customerProfileId: profile.id, productId },
      });
      revalidatePath("/wishlist");
      return { wishlisted: true };
    }
  } catch (err) {
    console.error("[toggleWishlist]", err);
    return { wishlisted: false, error: "Could not update wishlist" };
  }
}
