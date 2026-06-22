"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";

export type AddressFormData = {
  id?: string;
  label?: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  emirate?: string;
};

export async function saveAddress(
  data: AddressFormData
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Not signed in" };

    if (data.id) {
      await prisma.address.update({
        where: { id: data.id, userId: user.id },
        data: {
          label: data.label ?? null,
          fullName: data.fullName,
          phone: data.phone,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2 ?? null,
          city: data.city,
          emirate: data.emirate ?? null,
        },
      });
    } else {
      await prisma.address.create({
        data: {
          userId: user.id,
          label: data.label ?? null,
          fullName: data.fullName,
          phone: data.phone,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2 ?? null,
          city: data.city,
          emirate: data.emirate ?? null,
          isDefault: false,
        },
      });
    }

    revalidatePath("/profile");
    return { success: true };
  } catch (err) {
    console.error("[saveAddress]", err);
    return { success: false, error: "Could not save address" };
  }
}

export async function deleteAddress(
  id: string
): Promise<{ success: boolean }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false };
    await prisma.address.delete({ where: { id, userId: user.id } });
    revalidatePath("/profile");
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function setDefaultAddress(
  id: string
): Promise<{ success: boolean }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false };
    await prisma.$transaction([
      prisma.address.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      }),
      prisma.address.update({
        where: { id, userId: user.id },
        data: { isDefault: true },
      }),
    ]);
    revalidatePath("/profile");
    revalidatePath("/checkout");
    return { success: true };
  } catch {
    return { success: false };
  }
}
