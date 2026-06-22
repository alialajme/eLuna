# Phase 4b: Vendor Product Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 4a product/inventory/settings stub pages with full product CRUD, a variant matrix builder, inline stock management, and a store settings page.

**Architecture:** Next.js 15 RSC pages fetch data server-side and pass serialized props to "use client" form components; server actions in `actions/product.ts` handle all mutations with auth guards and Prisma. The dashboard layout (`(dashboard)/layout.tsx`) already handles auth — RSC pages return `null` for missing user/vendor as a safe fallback.

**Tech Stack:** Next.js 15 App Router (RSC + Server Actions), Prisma via `@e-luna/db`, Clerk via `safeCurrentUser()`, Tailwind CSS with Warm Oud tokens, React `useTransition` for async UI states.

---

## Key Facts for Every Task

- Working dir: `apps/vendor/` (all paths below are relative to `apps/vendor/app/`)
- Existing utilities:
  - `lib/auth.ts` → `safeCurrentUser(): Promise<User | null>`
  - `lib/vendor.ts` → `getVendorByUserId(userId): Promise<VendorWithStatus | null>` — type includes `id, userId, storeName, storeSlug, status, description, logoUrl, ibanNumber`
  - `lib/slugify.ts` → `slugify(name: string): string`
  - `actions/vendor.ts` → `createVendor`, `updateVendorProfile`, `updateVendorIBAN`
- Import `prisma` from `"@e-luna/db"`
- All Prisma calls in RSC pages must have `.catch(() => [])` or `.catch(() => null)` fallbacks
- Next.js 15: `searchParams` and `params` in page components are Promises — always `await` them
- No test suite in this project — TypeScript check (`npx tsc --noEmit`) serves as verification. Only pre-existing error is `tailwind.config.ts` module-not-found. Zero new errors required.
- Valid product categories: `"OCCASION"`, `"EVERYDAY"`, `"TRAVEL"`, `"SPORT"`
- ProductStatus enum values: `"DRAFT"`, `"ACTIVE"`, `"ARCHIVED"`

---

## Task 1: Extend vendor actions + create product server actions

**Files:**
- Modify: `actions/vendor.ts` (extend `updateVendorProfile` to accept `storeName`)
- Create: `actions/product.ts`

- [ ] **Step 1: Update `updateVendorProfile` in `actions/vendor.ts`**

Replace the existing `updateVendorProfile` function (keep the rest of the file unchanged):

```typescript
export async function updateVendorProfile(data: {
  storeName?: string;
  description?: string;
  logoUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Not signed in" };

    const trimmedName = data.storeName?.trim();
    if (trimmedName !== undefined && (trimmedName.length < 2 || trimmedName.length > 60)) {
      return { success: false, error: "Store name must be 2–60 characters" };
    }

    await prisma.vendor.update({
      where: { userId: user.id },
      data: {
        ...(trimmedName ? { storeName: trimmedName } : {}),
        description: data.description?.trim() || null,
        logoUrl: data.logoUrl?.trim() || null,
      },
    });

    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    console.error("[updateVendorProfile]", err);
    return { success: false, error: "Could not update profile" };
  }
}
```

- [ ] **Step 2: Create `actions/product.ts`**

```typescript
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
  const base = slugify(title);
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

    // Upsert variants from new data
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

    // Delete removed variants that have no order history
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
): Promise<{ success: boolean }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false };

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false };

  await prisma.product
    .update({
      where: { id, vendorId: vendor.id },
      data: { status: "ARCHIVED" },
    })
    .catch(() => null);

  revalidatePath("/products");
  return { success: true };
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

  await prisma.productVariant.update({
    where: { id: variantId },
    data: { stock },
  });

  revalidatePath("/inventory");
  return { success: true };
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -30
```

Expected: only the pre-existing `tailwind.config.ts` error. Zero new errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add apps/vendor/app/actions/vendor.ts apps/vendor/app/actions/product.ts && git commit -m "feat: product server actions (create, update, archive, stock) + extend updateVendorProfile"
```

---

## Task 2: Product list page

**Files:**
- Modify: `(dashboard)/products/page.tsx` (overwrite Phase 4a stub)

- [ ] **Step 1: Overwrite `(dashboard)/products/page.tsx`**

```typescript
import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { archiveProduct } from "../../actions/product";

export const metadata: Metadata = { title: "Products — Luna Vendor" };

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: "bg-sand text-mist",
  ACTIVE: "bg-gold/20 text-gold",
  ARCHIVED: "bg-coral/10 text-coral",
};

type Props = { searchParams: Promise<{ status?: string }> };

export default async function ProductsPage({ searchParams }: Props) {
  const { status: statusParam } = await searchParams;

  const user = await safeCurrentUser();
  if (!user) return null;

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null;

  const validStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"];
  const statusFilter = validStatuses.includes(statusParam ?? "")
    ? (statusParam as "DRAFT" | "ACTIVE" | "ARCHIVED")
    : undefined;

  const products = await prisma.product
    .findMany({
      where: {
        vendorId: vendor.id,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: { variants: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  const tabs = [
    { label: "All", value: undefined },
    { label: "Draft", value: "DRAFT" },
    { label: "Active", value: "ACTIVE" },
    { label: "Archived", value: "ARCHIVED" },
  ] as const;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-md text-ink">Products</h2>
        <Link
          href="/products/new"
          className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink transition-colors"
        >
          + New product
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-sand">
        {tabs.map((tab) => {
          const href = tab.value ? `/products?status=${tab.value}` : "/products";
          const isActive = statusFilter === tab.value;
          return (
            <Link
              key={tab.label}
              href={href}
              className={`px-4 py-2 text-body-sm transition-colors ${
                isActive
                  ? "border-b-2 border-gold text-gold"
                  : "text-mist hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-body-md text-mist mb-3">No products yet.</p>
          <Link href="/products/new" className="text-body-sm text-gold hover:underline">
            Add your first product →
          </Link>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-sand text-left">
              <th className="pb-2 text-body-xs font-medium text-mist">Title</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Category</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Price</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Status</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Variants</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Created</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr
                key={p.id}
                className="border-b border-sand/50 hover:bg-sand/30 transition-colors"
              >
                <td className="py-3 pr-4">
                  <Link
                    href={`/products/${p.id}`}
                    className="text-body-md font-medium text-ink hover:text-gold transition-colors"
                  >
                    {p.title}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-body-sm text-mist capitalize">
                  {p.category.toLowerCase()}
                </td>
                <td className="py-3 pr-4 text-body-sm text-ink">
                  AED{" "}
                  {Number(p.price).toLocaleString("en-AE", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-body-xs font-medium ${STATUS_CLASSES[p.status]}`}
                  >
                    {STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="py-3 pr-4 text-body-sm text-mist">
                  {p.variants.length}
                </td>
                <td className="py-3 pr-4 text-body-xs text-mist">
                  {new Date(p.createdAt).toLocaleDateString("en-AE")}
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/products/${p.id}`}
                      className="text-body-xs text-gold hover:underline"
                    >
                      Edit
                    </Link>
                    {p.status !== "ARCHIVED" && (
                      <form action={archiveProduct.bind(null, p.id)}>
                        <button
                          type="submit"
                          className="text-body-xs text-mist hover:text-coral transition-colors"
                        >
                          Archive
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -30
```

Expected: only pre-existing `tailwind.config.ts` error.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/products/page.tsx" && git commit -m "feat: vendor product list page with status filter and archive action"
```

---

## Task 3: VariantMatrix component

**Files:**
- Create: `(dashboard)/products/components/VariantMatrix.tsx`

- [ ] **Step 1: Create `(dashboard)/products/components/VariantMatrix.tsx`**

```typescript
"use client";

import { useState, KeyboardEvent } from "react";

export type VariantRow = {
  size: string;
  color: string;
  stock: number;
  price?: number;
  hasOrders: boolean;
};

type Props = {
  value: VariantRow[];
  onChange: (variants: VariantRow[]) => void;
};

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const tag = input.trim();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-sand bg-ivory p-2 min-h-[40px]">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 text-body-xs text-ink"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-mist hover:text-ink leading-none"
          >
            ✕
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[80px] bg-transparent text-body-sm text-ink outline-none placeholder:text-mist"
      />
    </div>
  );
}

export function VariantMatrix({ value, onChange }: Props) {
  const [sizes, setSizes] = useState<string[]>(() => [
    ...new Set(value.map((v) => v.size)),
  ]);
  const [colors, setColors] = useState<string[]>(() => [
    ...new Set(value.map((v) => v.color)),
  ]);

  const generate = () => {
    const rows: VariantRow[] = [];
    for (const size of sizes) {
      for (const color of colors) {
        const existing = value.find((v) => v.size === size && v.color === color);
        rows.push({
          size,
          color,
          stock: existing?.stock ?? 0,
          price: existing?.price,
          hasOrders: existing?.hasOrders ?? false,
        });
      }
    }
    onChange(rows);
  };

  const updateRow = (
    index: number,
    field: "stock" | "price",
    val: number | undefined
  ) => {
    onChange(value.map((row, i) => (i === index ? { ...row, [field]: val } : row)));
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-body-xs font-medium text-ink mb-1">Sizes</p>
        <TagInput tags={sizes} onChange={setSizes} placeholder="S, M, L, XL…" />
      </div>

      <div>
        <p className="text-body-xs font-medium text-ink mb-1">Colors</p>
        <TagInput tags={colors} onChange={setColors} placeholder="Black, Camel…" />
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={sizes.length === 0 || colors.length === 0}
        className="w-full rounded-lg border border-gold px-3 py-2 text-body-sm text-gold hover:bg-gold/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Generate combinations
      </button>

      {value.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-body-xs">
            <thead>
              <tr className="border-b border-sand">
                <th className="pb-1 text-left text-mist font-normal">Size</th>
                <th className="pb-1 text-left text-mist font-normal">Color</th>
                <th className="pb-1 text-left text-mist font-normal">Stock</th>
                <th className="pb-1 text-left text-mist font-normal">Price</th>
                <th className="pb-1"></th>
              </tr>
            </thead>
            <tbody>
              {value.map((row, i) => (
                <tr
                  key={`${row.size}-${row.color}`}
                  className="border-b border-sand/50"
                >
                  <td className="py-1 pr-2 text-ink">{row.size}</td>
                  <td className="py-1 pr-2 text-ink">{row.color}</td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min={0}
                      value={row.stock}
                      onChange={(e) =>
                        updateRow(i, "stock", parseInt(e.target.value) || 0)
                      }
                      className="w-14 rounded border border-sand bg-white px-1.5 py-0.5 text-body-xs text-ink"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={row.price ?? ""}
                      onChange={(e) =>
                        updateRow(
                          i,
                          "price",
                          e.target.value ? parseFloat(e.target.value) : undefined
                        )
                      }
                      placeholder="—"
                      className="w-16 rounded border border-sand bg-white px-1.5 py-0.5 text-body-xs text-ink placeholder:text-mist"
                    />
                  </td>
                  <td className="py-1">
                    {row.hasOrders ? (
                      <span className="text-mist text-body-xs" title="Has order history — cannot remove">
                        🔒
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-mist hover:text-coral transition-colors text-body-xs"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -30
```

Expected: only pre-existing `tailwind.config.ts` error.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/products/components/VariantMatrix.tsx" && git commit -m "feat: VariantMatrix component with tag inputs and combination generator"
```

---

## Task 4: ProductForm component

**Files:**
- Create: `(dashboard)/products/components/ProductForm.tsx`

- [ ] **Step 1: Create `(dashboard)/products/components/ProductForm.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VariantMatrix, type VariantRow } from "./VariantMatrix";
import { createProduct, updateProduct, type ProductData } from "../../../actions/product";

type InitialData = {
  title: string;
  description: string;
  category: string;
  fabric: string;
  careGuide: string;
  images: string[];
  price: number;
  compareAt?: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  variants: VariantRow[];
};

type Props = {
  productId?: string;
  initialData?: InitialData;
};

const CATEGORIES = [
  { value: "OCCASION", label: "Occasion" },
  { value: "EVERYDAY", label: "Everyday" },
  { value: "TRAVEL", label: "Travel" },
  { value: "SPORT", label: "Sport" },
] as const;

export function ProductForm({ productId, initialData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [category, setCategory] = useState(initialData?.category ?? "OCCASION");
  const [fabric, setFabric] = useState(initialData?.fabric ?? "");
  const [careGuide, setCareGuide] = useState(initialData?.careGuide ?? "");
  const [images, setImages] = useState<string[]>(
    initialData?.images?.length ? initialData.images : [""]
  );
  const [price, setPrice] = useState(initialData?.price?.toString() ?? "");
  const [compareAt, setCompareAt] = useState(
    initialData?.compareAt?.toString() ?? ""
  );
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE" | "ARCHIVED">(
    initialData?.status ?? "DRAFT"
  );
  const [variants, setVariants] = useState<VariantRow[]>(
    initialData?.variants ?? []
  );
  const [error, setError] = useState<string | null>(null);

  const addImage = () => {
    if (images.length < 8) setImages((prev) => [...prev, ""]);
  };
  const removeImage = (i: number) =>
    setImages((prev) => prev.filter((_, idx) => idx !== i));
  const updateImage = (i: number, val: string) =>
    setImages((prev) => prev.map((img, idx) => (idx === i ? val : img)));

  const handleSubmit = () => {
    setError(null);
    const data: ProductData = {
      title,
      description: description || undefined,
      category,
      fabric: fabric || undefined,
      careGuide: careGuide || undefined,
      images: images.filter(Boolean),
      price: parseFloat(price) || 0,
      compareAt: compareAt ? parseFloat(compareAt) : undefined,
      status,
      variants: variants.map(({ size, color, stock, price: vp }) => ({
        size,
        color,
        stock,
        price: vp,
      })),
    };

    startTransition(async () => {
      const result = productId
        ? await updateProduct(productId, data)
        : await createProduct(data);

      if (result.success) {
        router.push("/products");
      } else {
        setError(result.error ?? "Something went wrong");
      }
    });
  };

  return (
    <div className="flex gap-6 items-start">
      {/* Left column — content */}
      <div className="flex-1 space-y-5">
        <div>
          <label htmlFor="title" className="block text-body-sm font-medium text-ink mb-1">
            Title <span className="text-coral">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Embroidered Nida Abaya"
            className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-body-sm font-medium text-ink mb-1">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Describe your product…"
            className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="category" className="block text-body-sm font-medium text-ink mb-1">
              Category <span className="text-coral">*</span>
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink focus:border-gold focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fabric" className="block text-body-sm font-medium text-ink mb-1">
              Fabric
            </label>
            <input
              id="fabric"
              type="text"
              value={fabric}
              onChange={(e) => setFabric(e.target.value)}
              placeholder="e.g. 100% Nida"
              className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label htmlFor="careGuide" className="block text-body-sm font-medium text-ink mb-1">
            Care guide
          </label>
          <textarea
            id="careGuide"
            value={careGuide}
            onChange={(e) => setCareGuide(e.target.value)}
            rows={2}
            placeholder="e.g. Hand wash cold, hang dry"
            className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none resize-none"
          />
        </div>

        <div>
          <p className="text-body-sm font-medium text-ink mb-2">Images</p>
          <div className="space-y-2">
            {images.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => updateImage(i, e.target.value)}
                  placeholder="https://…"
                  className="flex-1 rounded-lg border border-sand bg-ivory px-3 py-2 text-body-sm text-ink placeholder:text-mist focus:border-gold focus:outline-none"
                />
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt=""
                    className="h-10 w-10 rounded object-cover border border-sand shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
                {images.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="text-mist hover:text-coral transition-colors text-body-sm shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {images.length < 8 && (
            <button
              type="button"
              onClick={addImage}
              className="mt-2 text-body-sm text-gold hover:underline"
            >
              + Add image
            </button>
          )}
        </div>
      </div>

      {/* Right sidebar — commerce */}
      <div className="w-64 shrink-0 space-y-4">
        <div className="rounded-2xl border border-sand bg-ivory p-4 space-y-4">
          <div>
            <label htmlFor="price" className="block text-body-sm font-medium text-ink mb-1">
              Price (AED) <span className="text-coral">*</span>
            </label>
            <input
              id="price"
              type="number"
              min={1}
              step={0.01}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-sand bg-white px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="compareAt" className="block text-body-sm font-medium text-ink mb-1">
              Compare-at (AED)
            </label>
            <input
              id="compareAt"
              type="number"
              min={0}
              step={0.01}
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-sand bg-white px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="status" className="block text-body-sm font-medium text-ink mb-1">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "DRAFT" | "ACTIVE" | "ARCHIVED")
              }
              className="w-full rounded-lg border border-sand bg-white px-3 py-2 text-body-md text-ink focus:border-gold focus:outline-none"
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-sand bg-ivory p-4">
          <p className="text-body-sm font-medium text-ink mb-3">Variants</p>
          <VariantMatrix value={variants} onChange={setVariants} />
        </div>

        {error && <p className="text-body-sm text-coral">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full rounded-full bg-ink px-4 py-3 text-body-md font-medium text-ivory disabled:opacity-50 hover:bg-gold hover:text-ink transition-colors"
        >
          {isPending ? "Saving…" : "Save product"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -30
```

Expected: only pre-existing `tailwind.config.ts` error.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/products/components/ProductForm.tsx" && git commit -m "feat: ProductForm two-column component for product create/edit"
```

---

## Task 5: New product page + Edit product page

**Files:**
- Create: `(dashboard)/products/new/page.tsx`
- Create: `(dashboard)/products/[id]/page.tsx`

- [ ] **Step 1: Create `(dashboard)/products/new/page.tsx`**

```typescript
import { Metadata } from "next";
import { ProductForm } from "../components/ProductForm";

export const metadata: Metadata = { title: "New product — Luna Vendor" };

export default function NewProductPage() {
  return (
    <div className="max-w-4xl">
      <h2 className="font-display text-display-md text-ink mb-6">New product</h2>
      <ProductForm />
    </div>
  );
}
```

- [ ] **Step 2: Create `(dashboard)/products/[id]/page.tsx`**

```typescript
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";
import { ProductForm } from "../components/ProductForm";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await prisma.product
    .findUnique({ where: { id }, select: { title: true } })
    .catch(() => null);
  return {
    title: product
      ? `${product.title} — Luna Vendor`
      : "Edit product — Luna Vendor",
  };
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) return null;

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null;

  const product = await prisma.product
    .findUnique({
      where: { id },
      include: {
        variants: {
          include: { _count: { select: { orderItems: true } } },
        },
      },
    })
    .catch(() => null);

  if (!product || product.vendorId !== vendor.id) redirect("/products");

  const initialData = {
    title: product.title,
    description: product.description ?? "",
    category: product.category,
    fabric: product.fabric ?? "",
    careGuide: product.careGuide ?? "",
    images:
      Array.isArray(product.aiImages) && product.aiImages.length > 0
        ? (product.aiImages as string[])
        : [""],
    price: Number(product.price),
    compareAt: product.compareAt ? Number(product.compareAt) : undefined,
    status: product.status as "DRAFT" | "ACTIVE" | "ARCHIVED",
    variants: product.variants.map((v) => ({
      size: v.size,
      color: v.color,
      stock: v.stock,
      price: v.price ? Number(v.price) : undefined,
      hasOrders: v._count.orderItems > 0,
    })),
  };

  return (
    <div className="max-w-4xl">
      <h2 className="font-display text-display-md text-ink mb-6">Edit product</h2>
      <ProductForm productId={product.id} initialData={initialData} />
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -30
```

Expected: only pre-existing `tailwind.config.ts` error.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/products/new/" "apps/vendor/app/(dashboard)/products/[id]/" && git commit -m "feat: new product and edit product pages"
```

---

## Task 6: Inventory page + StockInput component

**Files:**
- Create: `(dashboard)/inventory/components/StockInput.tsx`
- Modify: `(dashboard)/inventory/page.tsx` (overwrite Phase 4a stub)

- [ ] **Step 1: Create `(dashboard)/inventory/components/StockInput.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { updateVariantStock } from "../../../actions/product";

type Props = {
  variantId: string;
  initialStock: number;
};

export function StockInput({ variantId, initialStock }: Props) {
  const [stock, setStock] = useState(initialStock.toString());
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    setSaved(false);
    const val = Math.max(0, parseInt(stock) || 0);
    startTransition(async () => {
      const result = await updateVariantStock(variantId, val);
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.error ?? "Failed");
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={stock}
        onChange={(e) => {
          setStock(e.target.value);
          setSaved(false);
        }}
        className="w-16 rounded border border-sand bg-ivory px-2 py-1 text-body-sm text-ink focus:border-gold focus:outline-none"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="text-body-xs text-gold hover:underline disabled:opacity-50"
      >
        {isPending ? "…" : saved ? "Saved ✓" : "Save"}
      </button>
      {error && <span className="text-body-xs text-coral">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Overwrite `(dashboard)/inventory/page.tsx`**

```typescript
import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { StockInput } from "./components/StockInput";

export const metadata: Metadata = { title: "Inventory — Luna Vendor" };

export default async function InventoryPage() {
  const user = await safeCurrentUser();
  if (!user) return null;

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null;

  const variants = await prisma.productVariant
    .findMany({
      where: { product: { vendorId: vendor.id } },
      include: { product: { select: { title: true } } },
      orderBy: [
        { product: { title: "asc" } },
        { size: "asc" },
        { color: "asc" },
      ],
    })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Inventory</h2>

      {variants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-body-md text-mist mb-3">
            No variants yet. Add products to manage inventory.
          </p>
          <Link href="/products/new" className="text-body-sm text-gold hover:underline">
            Add your first product →
          </Link>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-sand text-left">
              <th className="pb-2 text-body-xs font-medium text-mist">Product</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Size</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Color</th>
              <th className="pb-2 text-body-xs font-medium text-mist">SKU</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Stock</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const isLow = v.stock > 0 && v.stock <= 3;
              const isOut = v.stock === 0;
              return (
                <tr
                  key={v.id}
                  className={`border-b border-sand/50 ${isLow || isOut ? "bg-coral/5" : ""}`}
                >
                  <td className="py-3 pr-4 text-body-sm text-ink">
                    {v.product.title}
                  </td>
                  <td className="py-3 pr-4 text-body-sm text-mist">{v.size}</td>
                  <td className="py-3 pr-4 text-body-sm text-mist">{v.color}</td>
                  <td className="py-3 pr-4 font-mono text-body-xs text-mist">
                    {v.sku}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <StockInput variantId={v.id} initialStock={v.stock} />
                      {isOut && (
                        <span className="text-body-xs font-medium text-coral">
                          Out of stock
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -30
```

Expected: only pre-existing `tailwind.config.ts` error.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/inventory/" && git commit -m "feat: inventory page with inline stock editing per variant"
```

---

## Task 7: Settings page + form components

**Files:**
- Create: `(dashboard)/settings/components/ProfileForm.tsx`
- Create: `(dashboard)/settings/components/IbanForm.tsx`
- Modify: `(dashboard)/settings/page.tsx` (overwrite Phase 4a stub)

- [ ] **Step 1: Create `(dashboard)/settings/components/ProfileForm.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { updateVendorProfile } from "../../../actions/vendor";

type Props = {
  storeName: string;
  description: string;
  logoUrl: string;
};

export function ProfileForm({ storeName, description, logoUrl }: Props) {
  const [name, setName] = useState(storeName);
  const [desc, setDesc] = useState(description);
  const [logo, setLogo] = useState(logoUrl);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateVendorProfile({
        storeName: name,
        description: desc,
        logoUrl: logo,
      });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error ?? "Failed to save profile");
      }
    });
  };

  return (
    <div className="rounded-2xl border border-sand bg-ivory p-5 space-y-4">
      <h3 className="font-display text-display-sm text-ink">Store profile</h3>

      <div>
        <label htmlFor="storeName" className="block text-body-sm font-medium text-ink mb-1">
          Store name <span className="text-coral">*</span>
        </label>
        <input
          id="storeName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="w-full rounded-lg border border-sand bg-white px-3 py-2 text-body-md text-ink focus:border-gold focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="storeDesc" className="block text-body-sm font-medium text-ink mb-1">
          Description
        </label>
        <textarea
          id="storeDesc"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-sand bg-white px-3 py-2 text-body-md text-ink focus:border-gold focus:outline-none resize-none"
        />
      </div>

      <div>
        <label htmlFor="logoUrl" className="block text-body-sm font-medium text-ink mb-1">
          Logo URL
        </label>
        <div className="flex items-center gap-3">
          <input
            id="logoUrl"
            type="url"
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
            placeholder="https://…"
            className="flex-1 rounded-lg border border-sand bg-white px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none"
          />
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt="Logo preview"
              className="h-10 w-10 rounded-full object-cover border border-sand shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory disabled:opacity-50 hover:bg-gold hover:text-ink transition-colors"
        >
          {isPending ? "Saving…" : "Save profile"}
        </button>
        {saved && <span className="text-body-sm text-gold">Saved ✓</span>}
        {error && <span className="text-body-sm text-coral">{error}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `(dashboard)/settings/components/IbanForm.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { updateVendorIBAN } from "../../../actions/vendor";

type Props = {
  ibanNumber: string;
};

export function IbanForm({ ibanNumber }: Props) {
  const [iban, setIban] = useState(ibanNumber);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateVendorIBAN(iban);
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error ?? "Invalid IBAN");
      }
    });
  };

  return (
    <div className="rounded-2xl border border-sand bg-ivory p-5 space-y-4">
      <h3 className="font-display text-display-sm text-ink">Payout details</h3>
      <p className="text-body-sm text-mist">
        Required before your first payout. UAE IBANs start with AE followed by 21 digits.
      </p>

      <div>
        <label htmlFor="iban" className="block text-body-sm font-medium text-ink mb-1">
          IBAN
        </label>
        <input
          id="iban"
          type="text"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder="AE07 0331 2345 6789 0123 456"
          className="w-full rounded-lg border border-sand bg-white px-3 py-2 text-body-md font-mono text-ink placeholder:text-mist focus:border-gold focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory disabled:opacity-50 hover:bg-gold hover:text-ink transition-colors"
        >
          {isPending ? "Saving…" : "Save IBAN"}
        </button>
        {saved && <span className="text-body-sm text-gold">Saved ✓</span>}
        {error && <span className="text-body-sm text-coral">{error}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Overwrite `(dashboard)/settings/page.tsx`**

```typescript
import { Metadata } from "next";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { ProfileForm } from "./components/ProfileForm";
import { IbanForm } from "./components/IbanForm";

export const metadata: Metadata = { title: "Settings — Luna Vendor" };

export default async function SettingsPage() {
  const user = await safeCurrentUser();
  if (!user) return null;

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="font-display text-display-md text-ink">Settings</h2>

      <ProfileForm
        storeName={vendor.storeName}
        description={vendor.description ?? ""}
        logoUrl={vendor.logoUrl ?? ""}
      />

      <IbanForm ibanNumber={vendor.ibanNumber ?? ""} />
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -30
```

Expected: only pre-existing `tailwind.config.ts` error.

- [ ] **Step 5: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/settings/" && git commit -m "feat: settings page with store profile and IBAN forms"
```

---

## Task 8: Final TypeScript check + push

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check across all vendor app**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1
```

Expected output: only the pre-existing error:
```
tailwind.config.ts(1,29): error TS2307: Cannot find module 'tailwindcss' or its corresponding type declarations.
```

Zero new errors. If there are new errors, fix them before pushing.

- [ ] **Step 2: Verify all new route files exist**

```bash
find /Users/alialajme/Projects/Luna/e-luna/apps/vendor/app -name "*.tsx" | sort
```

Expected files created in this phase:
- `(dashboard)/products/page.tsx` (modified)
- `(dashboard)/products/new/page.tsx`
- `(dashboard)/products/[id]/page.tsx`
- `(dashboard)/products/components/ProductForm.tsx`
- `(dashboard)/products/components/VariantMatrix.tsx`
- `(dashboard)/inventory/page.tsx` (modified)
- `(dashboard)/inventory/components/StockInput.tsx`
- `(dashboard)/settings/page.tsx` (modified)
- `(dashboard)/settings/components/ProfileForm.tsx`
- `(dashboard)/settings/components/IbanForm.tsx`
- `actions/product.ts`

- [ ] **Step 3: Push**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git push
```
