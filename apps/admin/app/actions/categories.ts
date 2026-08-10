"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

function normalizeSlug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function requireAdmin(): Promise<{ ok: true } | { error: string }> {
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };
  return { ok: true };
}

function isUniqueError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function createCategory(input: { name: string; slug?: string; sortOrder?: number }): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };
  const name = input.name.trim();
  if (!name) return { error: "Name is required" };
  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { error: "Invalid slug" };
  try {
    await prisma.category.create({ data: { name, slug, sortOrder: input.sortOrder ?? 0 } });
    revalidatePath("/categories");
    return { success: true };
  } catch (e) {
    return { error: isUniqueError(e) ? "Slug already in use" : "Failed to create category" };
  }
}

export async function updateCategory(
  id: string,
  input: { name?: string; slug?: string; sortOrder?: number; isActive?: boolean },
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };
  const data: { name?: string; slug?: string; sortOrder?: number; isActive?: boolean } = {};
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) return { error: "Name is required" };
    data.name = n;
  }
  if (input.slug !== undefined) {
    const s = normalizeSlug(input.slug);
    if (!s) return { error: "Invalid slug" };
    data.slug = s;
  }
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  try {
    await prisma.category.update({ where: { id }, data });
    revalidatePath("/categories");
    return { success: true };
  } catch (e) {
    return { error: isUniqueError(e) ? "Slug already in use" : "Failed to update category" };
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };
  try {
    await prisma.category.delete({ where: { id } });
    revalidatePath("/categories");
    return { success: true };
  } catch {
    return { error: "Failed to delete category" };
  }
}
