"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";

export type SizeProfileFormData = {
  usualSize?: string;
  sizeSystem?: string;
  height?: string;
  weight?: string;
  bust?: string;
  waist?: string;
  hip?: string;
  shoulder?: string;
  sleeveLength?: string;
  preferredAbayaLength?: string;
  fitPreference?: string;
};

export async function saveSizeProfile(
  data: SizeProfileFormData
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Not signed in" };

    let profile = await prisma.customerProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      profile = await prisma.customerProfile.create({
        data: { userId: user.id },
      });
    }

    const toFloat = (val?: string) => (val && val !== "" ? parseFloat(val) : null);

    await prisma.sizeProfile.upsert({
      where: { customerProfileId: profile.id },
      create: {
        customerProfileId: profile.id,
        usualSize: data.usualSize || null,
        sizeSystem: data.sizeSystem || "INTL",
        height: toFloat(data.height),
        weight: toFloat(data.weight),
        bust: toFloat(data.bust),
        waist: toFloat(data.waist),
        hip: toFloat(data.hip),
        shoulder: toFloat(data.shoulder),
        sleeveLength: data.sleeveLength || null,
        preferredAbayaLength: data.preferredAbayaLength || null,
        fitPreference: data.fitPreference || null,
      },
      update: {
        usualSize: data.usualSize || null,
        sizeSystem: data.sizeSystem || "INTL",
        height: toFloat(data.height),
        weight: toFloat(data.weight),
        bust: toFloat(data.bust),
        waist: toFloat(data.waist),
        hip: toFloat(data.hip),
        shoulder: toFloat(data.shoulder),
        sleeveLength: data.sleeveLength || null,
        preferredAbayaLength: data.preferredAbayaLength || null,
        fitPreference: data.fitPreference || null,
      },
    });

    revalidatePath("/profile/size");
    revalidatePath("/profile");
    return { success: true };
  } catch (err) {
    console.error("[saveSizeProfile]", err);
    return { success: false, error: "Could not save profile" };
  }
}
