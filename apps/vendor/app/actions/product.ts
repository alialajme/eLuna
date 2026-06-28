"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { slugify } from "../lib/slugify";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

const VALID_CATEGORIES = ["OCCASION", "EVERYDAY", "TRAVEL", "SPORT"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

export type VariantInput = {
  size: string;
  color: string;
  stock: number;
  price?: number;
};

export type ProductData = {
  title: string;
  description?: string;
  category: string;
  fabric?: string;
  careGuide?: string;
  images: string[];
  price: number;
  compareAt?: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  variants: VariantInput[];
};

async function generateSlug(title: string): Promise<string> {
  const base = slugify(title) || `product-${Date.now()}`;
  let candidate = base;
  let n = 2;
  while (true) {
    const existing = await prisma.product.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${n}`;
    n++;
  }
}

function buildSku(
  storeSlug: string,
  titleSlug: string,
  size: string,
  color: string
): string {
  return `${storeSlug}-${titleSlug}-${slugify(size)}-${slugify(color)}`
    .slice(0, 40)
    .toUpperCase();
}

export async function createProduct(
  data: ProductData
): Promise<{ success: boolean; productId?: string; error?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Not signed in" };

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  const title = data.title.trim();
  if (title.length < 2 || title.length > 120) {
    return { success: false, error: "Title must be 2–120 characters" };
  }
  if (data.price <= 0) {
    return { success: false, error: "Price must be greater than 0" };
  }
  if (!VALID_CATEGORIES.includes(data.category as Category)) {
    return { success: false, error: "Invalid category" };
  }

  try {
    const slug = await generateSlug(title);
    const titleSlug = slugify(title);

    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        title,
        slug,
        description: data.description ?? null,
        price: data.price,
        compareAt: data.compareAt ?? null,
        category: data.category,
        fabric: data.fabric ?? null,
        careGuide: data.careGuide ?? null,
        aiImages: data.images.filter(Boolean),
        status: data.status,
        variants: {
          create: data.variants.map((v) => ({
            size: v.size,
            color: v.color,
            stock: v.stock,
            price: v.price ?? null,
            sku: buildSku(vendor.storeSlug, titleSlug, v.size, v.color),
          })),
        },
      },
    });

    revalidatePath("/products");
    revalidatePath("/");
    return { success: true, productId: product.id };
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return {
        success: false,
        error: "A variant with that size/color combination already exists",
      };
    }
    return { success: false, error: "Failed to create product" };
  }
}

export async function updateProduct(
  id: string,
  data: ProductData
): Promise<{ success: boolean; error?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Not signed in" };

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  const title = data.title.trim();
  if (title.length < 2 || title.length > 120) {
    return { success: false, error: "Title must be 2–120 characters" };
  }
  if (data.price <= 0) {
    return { success: false, error: "Price must be greater than 0" };
  }
  if (!VALID_CATEGORIES.includes(data.category as Category)) {
    return { success: false, error: "Invalid category" };
  }

  try {
    const existing = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          include: { _count: { select: { orderItems: true } } },
        },
      },
    });

    if (!existing || existing.vendorId !== vendor.id) {
      return { success: false, error: "Product not found" };
    }

    await prisma.product.update({
      where: { id },
      data: {
        title,
        description: data.description ?? null,
        price: data.price,
        compareAt: data.compareAt ?? null,
        category: data.category,
        fabric: data.fabric ?? null,
        careGuide: data.careGuide ?? null,
        aiImages: data.images.filter(Boolean),
        status: data.status,
      },
    });

    const titleSlug = slugify(title);

    for (const v of data.variants) {
      const existingVariant = existing.variants.find(
        (ev) => ev.size === v.size && ev.color === v.color
      );
      if (existingVariant) {
        await prisma.productVariant.update({
          where: { id: existingVariant.id },
          data: { stock: v.stock, price: v.price ?? null },
        });
      } else {
        await prisma.productVariant.create({
          data: {
            productId: id,
            size: v.size,
            color: v.color,
            stock: v.stock,
            price: v.price ?? null,
            sku: buildSku(vendor.storeSlug, titleSlug, v.size, v.color),
          },
        });
      }
    }

    for (const ev of existing.variants) {
      const stillPresent = data.variants.some(
        (v) => v.size === ev.size && v.color === ev.color
      );
      if (!stillPresent && ev._count.orderItems === 0) {
        await prisma.productVariant.delete({ where: { id: ev.id } });
      }
    }

    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update product" };
  }
}

export async function archiveProduct(
  id: string,
  _formData?: FormData
): Promise<void> {
  const user = await safeCurrentUser();
  if (!user) return;

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return;

  await prisma.product
    .update({
      where: { id, vendorId: vendor.id },
      data: { status: "ARCHIVED" },
    })
    .catch(() => null);

  revalidatePath("/products");
}

export async function updateVariantStock(
  variantId: string,
  stock: number
): Promise<{ success: boolean; error?: string }> {
  if (!Number.isInteger(stock) || stock < 0) {
    return { success: false, error: "Stock must be a non-negative integer" };
  }

  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Not signed in" };

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  const variant = await prisma.productVariant
    .findUnique({
      where: { id: variantId },
      include: { product: { select: { vendorId: true } } },
    })
    .catch(() => null);

  if (!variant || variant.product.vendorId !== vendor.id) {
    return { success: false, error: "Variant not found" };
  }

  try {
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { stock },
    });
    revalidatePath("/inventory");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update stock" };
  }
}
