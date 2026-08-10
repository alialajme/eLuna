"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { slugify } from "../lib/slugify";
import { safeCurrentUser } from "../lib/auth";
import { getSupplierByUserId } from "../lib/supplier";
import { isMaterialType, type MaterialUnitValue } from "../lib/materials";

export type MaterialData = {
  name: string;
  materialType: string;
  color?: string;
  composition?: string;
  unit: MaterialUnitValue;
  wholesalePrice: number;
  moq: number;
  stock: number;
  description?: string;
  images: string[];
  status: "DRAFT" | "ACTIVE";
};

const UNITS = ["METER", "YARD", "ROLL", "PIECE", "SPOOL"];

type ActiveSupplier = { id: string };

// Resolves the signed-in user's supplier and requires it to be ACTIVE.
async function resolveActiveSupplier(): Promise<
  { supplier: ActiveSupplier } | { error: string }
> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return { error: "Not a supplier" };
  if (supplier.status !== "ACTIVE") return { error: "Your supplier account is not active" };
  return { supplier: { id: supplier.id } };
}

// Returns a normalized MaterialData or an error string.
function validate(data: MaterialData): { data: MaterialData } | { error: string } {
  const name = data.name.trim();
  if (name.length < 2 || name.length > 80) return { error: "Name must be 2–80 characters" };
  if (!isMaterialType(data.materialType)) return { error: "Invalid material type" };
  if (!UNITS.includes(data.unit)) return { error: "Invalid unit" };
  if (!Number.isFinite(data.wholesalePrice) || data.wholesalePrice <= 0) {
    return { error: "Wholesale price must be greater than 0" };
  }
  if (!Number.isInteger(data.moq) || data.moq < 1) return { error: "MOQ must be a whole number ≥ 1" };
  if (!Number.isInteger(data.stock) || data.stock < 0) {
    return { error: "Stock must be a non-negative whole number" };
  }
  if (data.status !== "DRAFT" && data.status !== "ACTIVE") return { error: "Invalid status" };
  const images = data.images.map((s) => s.trim()).filter(Boolean).slice(0, 8);
  return { data: { ...data, name, images } };
}

async function generateSlug(name: string): Promise<string> {
  const base = slugify(name) || `material-${Date.now()}`;
  let candidate = base;
  let n = 2;
  while (true) {
    const existing = await prisma.material
      .findUnique({ where: { slug: candidate }, select: { id: true } })
      .catch(() => null);
    if (!existing) return candidate;
    candidate = `${base}-${n}`;
    n++;
  }
}

export async function createMaterial(
  input: MaterialData
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const checked = validate(input);
  if ("error" in checked) return { success: false, error: checked.error };
  const data = checked.data;

  try {
    const slug = await generateSlug(data.name);
    const material = await prisma.material.create({
      data: {
        supplierId: auth.supplier.id,
        name: data.name,
        slug,
        materialType: data.materialType,
        color: data.color?.trim() || null,
        composition: data.composition?.trim() || null,
        unit: data.unit,
        wholesalePrice: data.wholesalePrice,
        moq: data.moq,
        stock: data.stock,
        description: data.description?.trim() || null,
        images: data.images,
        status: data.status,
      },
      select: { id: true },
    });
    revalidatePath("/materials");
    revalidatePath("/");
    return { success: true, id: material.id };
  } catch {
    return { success: false, error: "Failed to create material" };
  }
}

export async function updateMaterial(
  id: string,
  input: MaterialData
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const checked = validate(input);
  if ("error" in checked) return { success: false, error: checked.error };
  const data = checked.data;

  const existing = await prisma.material
    .findUnique({ where: { id }, select: { supplierId: true } })
    .catch(() => null);
  if (!existing || existing.supplierId !== auth.supplier.id) {
    return { success: false, error: "Not found" };
  }

  try {
    await prisma.material.update({
      where: { id },
      data: {
        name: data.name,
        materialType: data.materialType,
        color: data.color?.trim() || null,
        composition: data.composition?.trim() || null,
        unit: data.unit,
        wholesalePrice: data.wholesalePrice,
        moq: data.moq,
        stock: data.stock,
        description: data.description?.trim() || null,
        images: data.images,
        status: data.status,
      },
    });
    revalidatePath("/materials");
    revalidatePath(`/materials/${id}`);
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update material" };
  }
}

export async function archiveMaterial(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const existing = await prisma.material
    .findUnique({ where: { id }, select: { supplierId: true } })
    .catch(() => null);
  if (!existing || existing.supplierId !== auth.supplier.id) {
    return { success: false, error: "Not found" };
  }

  try {
    await prisma.material.update({ where: { id }, data: { status: "ARCHIVED" } });
    revalidatePath("/materials");
    revalidatePath(`/materials/${id}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to archive material" };
  }
}

export async function deleteMaterial(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const existing = await prisma.material
    .findUnique({ where: { id }, select: { supplierId: true } })
    .catch(() => null);
  if (!existing || existing.supplierId !== auth.supplier.id) {
    return { success: false, error: "Not found" };
  }

  try {
    await prisma.material.delete({ where: { id } });
    revalidatePath("/materials");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete material" };
  }
}
