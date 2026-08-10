"use server";

import { revalidatePath } from "next/cache";
import { setSetting, type SettingKey } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

export async function updateSetting(key: SettingKey, value: string): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  const r = await setSetting(key, value);
  if (!r.ok) return { error: r.error ?? "Invalid setting" };
  revalidatePath("/settings");
  return { success: true };
}
