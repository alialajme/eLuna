# Category Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three inconsistent hardcoded category lists with an admin-managed `Category` table that the vendor product form/validation and the customer storefront read from.

**Architecture:** `Category { name, slug, sortOrder, isActive }` + a `getCategories()` helper (default-fallback) in `@e-luna/db`; admin CRUD; vendor product form/validation + customer home/browse/category-route/footer all read `getCategories()`. `Product.category` stays a slug string (no FK/migration).

**Tech Stack:** Next.js 15 (App Router), Prisma + PostgreSQL (`db push`, no migration files), TypeScript (`noUncheckedIndexedAccess` on), Clerk, `@e-luna/auth` `getAuthUser`.

---

## Context for the implementer (read once)

- **No test suite.** "Tests" = `npx tsc --noEmit` + `npx next lint`. Repo uses **`prisma db push`**; after schema edits run `pnpm --filter @e-luna/db db:generate`. `db push` to a live DB is an operator step. `noUncheckedIndexedAccess` is ON (`arr[0]?.x`).
- **Verified state:**
  - `Product.category` is a free-form `String`. `packages/db/src/index.ts` = `export { prisma } from "./client"; export * from "@prisma/client";`. Prisma accessor: `prisma.category`.
  - Admin actions gate: `getAuthUser()` from `@e-luna/auth` → `if (!user) return {error:"Unauthorized"}; if (user.role !== "ADMIN") return {error:"Forbidden"};`. `Prisma` (for `PrismaClientKnownRequestError`) is re-exported from `@e-luna/db`.
  - Admin nav `apps/admin/app/(dashboard)/components/Sidebar.tsx` — `NAV_ITEMS` array (…Customers/Fraud/Settings); active-check has a `pathname === href` fallback.
  - Vendor `apps/vendor/app/actions/product.ts`: imports `{ prisma }` from `@e-luna/db`; `VALID_CATEGORIES = ["OCCASION","EVERYDAY","TRAVEL","SPORT"]` + `type Category` (lines 9-10); guard `if (!VALID_CATEGORIES.includes(data.category as Category)) return { success:false, error:"Invalid category" };` appears in BOTH `createProduct` (~line 74) and `updateProduct` (~line 143).
  - Vendor `ProductForm.tsx` (client): `import { createProduct, updateProduct } from "../../../actions/product";`; `Props = { productId?, initialData? }`; `const CATEGORIES = [{value:"OCCASION",label:"Occasion"},…] as const` (lines 28-33); `const [category, setCategory] = useState(initialData?.category ?? "OCCASION")` (line 42); the `<select value={category}>` maps `CATEGORIES` (`cat.value`/`cat.label`) at lines 154-164. Rendered by `products/new/page.tsx` (`<ProductForm />`) and `products/[id]/page.tsx` (`<ProductForm productId initialData />`).
  - Customer `page.tsx`: `import { prisma } from "@e-luna/db";`; `CATEGORIES` const (lines 6-11, `{label,slug,emoji}`); `categoryStats = groupBy(["category"])`; `countMap = Object.fromEntries(categoryStats.map(c => [c.category, c._count._all]))`; `categoryCounts = CATEGORIES.map(cat => ({...cat, count: countMap[cat.slug] ?? 0}))`; render maps `categoryCounts` using `cat.emoji`, `cat.label`, `cat.slug`, `cat.count` (lines ~61-70).
  - Customer `browse/page.tsx`: the first `Promise.all` entry (lines ~57-61) fetches distinct product categories → `string[]` named `categories`, passed to the filter UI. `import { prisma } from "@e-luna/db";`.
  - Customer `browse/[category]/page.tsx:4`: `const VALID_CATEGORIES = ["occasion","everyday","travel","sport"];`; guard `if (!VALID_CATEGORIES.includes(category.toLowerCase())) notFound();` (~line 23).
  - Customer `components/Footer.tsx`: four hardcoded `<li><Link href="/browse?category=Occasion">…` links (lines ~19-22); rendered in `layout.tsx`.

---

## File Structure

```
packages/db/prisma/schema.prisma                               — Category model
packages/db/src/categories.ts                                   — getCategories/getAllCategories/DEFAULT_CATEGORIES/CategoryDTO
packages/db/src/index.ts                                        — export * from "./categories"
apps/admin/app/actions/categories.ts                            — create/update/delete (ADMIN-gated)
apps/admin/app/(dashboard)/categories/page.tsx                  — list page
apps/admin/app/(dashboard)/categories/CategoryManager.tsx      — client CRUD
apps/admin/app/(dashboard)/components/Sidebar.tsx              — "Categories" nav
apps/vendor/app/actions/product.ts                             — validate managed slugs
apps/vendor/app/(dashboard)/products/components/ProductForm.tsx — categories prop
apps/vendor/app/(dashboard)/products/new/page.tsx              — pass categories
apps/vendor/app/(dashboard)/products/[id]/page.tsx            — pass categories
apps/customer/app/page.tsx                                     — getCategories + counts
apps/customer/app/browse/page.tsx                             — filter list from getCategories
apps/customer/app/browse/[category]/page.tsx                  — validate slugs
apps/customer/app/components/Footer.tsx                       — async links
```

---

## Task 1: Category model + helper + regen

**Files:** Modify `packages/db/prisma/schema.prisma`; Create `packages/db/src/categories.ts`; Modify `packages/db/src/index.ts`.

- [ ] **Step 1: Add the `Category` model to `packages/db/prisma/schema.prisma`**

```prisma
model Category {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  sortOrder Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([isActive, sortOrder])
}
```

- [ ] **Step 2: Create `packages/db/src/categories.ts`**

```ts
import { prisma } from "./client";

export type CategoryDTO = { name: string; slug: string };

export const DEFAULT_CATEGORIES: CategoryDTO[] = [
  { name: "Occasion", slug: "occasion" },
  { name: "Everyday", slug: "everyday" },
  { name: "Travel", slug: "travel" },
  { name: "Sport", slug: "sport" },
];

export async function getCategories(): Promise<CategoryDTO[]> {
  const rows = await prisma.category
    .findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { name: true, slug: true },
    })
    .catch(() => [] as CategoryDTO[]);
  return rows.length > 0 ? rows : DEFAULT_CATEGORIES;
}

export async function getAllCategories() {
  return prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }).catch(() => []);
}
```

- [ ] **Step 3: Export from `packages/db/src/index.ts`** — append:
```ts
export * from "./categories";
```

- [ ] **Step 4: Regenerate the Prisma client**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @e-luna/db db:generate`
Expected: "Generated Prisma Client" success (`prisma.category` exists).

- [ ] **Step 5: Type-check the db package**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @e-luna/db exec tsc --noEmit 2>&1 | tail -6`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add packages/db/prisma/schema.prisma packages/db/src/categories.ts packages/db/src/index.ts
git commit -m "feat(db): Category model + getCategories helper with default-fallback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Admin category CRUD

**Files:** Create `apps/admin/app/actions/categories.ts`, `apps/admin/app/(dashboard)/categories/page.tsx`, `apps/admin/app/(dashboard)/categories/CategoryManager.tsx`; Modify `apps/admin/app/(dashboard)/components/Sidebar.tsx`.

- [ ] **Step 1: Create `apps/admin/app/actions/categories.ts`**

```ts
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
```

- [ ] **Step 2: Create `apps/admin/app/(dashboard)/categories/CategoryManager.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCategory, updateCategory, deleteCategory } from "../../actions/categories";

type Category = { id: string; name: string; slug: string; sortOrder: number; isActive: boolean };
type Props = { categories: Category[] };

export function CategoryManager({ categories }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const run = (fn: () => Promise<{ success: true } | { error: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if ("error" in r) {
        setError(r.error);
        return;
      }
      after?.();
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {/* Add */}
      <div className="rounded-lg border border-sand bg-ivory p-4">
        <p className="mb-2 text-body-sm font-medium text-ink">Add category</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="rounded-lg border border-sand bg-white px-3 py-2 text-body-sm text-ink"
          />
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="slug (optional)"
            className="rounded-lg border border-sand bg-white px-3 py-2 text-body-sm text-ink"
          />
          <button
            type="button"
            disabled={isPending || !newName.trim()}
            onClick={() =>
              run(() => createCategory({ name: newName, slug: newSlug || undefined }), () => {
                setNewName("");
                setNewSlug("");
              })
            }
            className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-sage hover:text-ink disabled:opacity-50 transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* List */}
      {categories.length === 0 ? (
        <p className="text-body-md text-mist">No categories yet — using the built-in defaults on the storefront until you add some.</p>
      ) : (
        <div className="space-y-2">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} isPending={isPending} run={run} />
          ))}
        </div>
      )}

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}

function CategoryRow({
  category,
  isPending,
  run,
}: {
  category: Category;
  isPending: boolean;
  run: (fn: () => Promise<{ success: true } | { error: string }>, after?: () => void) => void;
}) {
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sand bg-ivory p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-36 rounded-lg border border-sand bg-white px-3 py-1.5 text-body-sm text-ink"
      />
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        className="w-36 rounded-lg border border-sand bg-white px-3 py-1.5 text-body-sm text-ink"
      />
      <input
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
        className="w-16 rounded-lg border border-sand bg-white px-2 py-1.5 text-body-sm text-ink"
      />
      <label className="flex items-center gap-1 text-body-xs text-ink">
        <input
          type="checkbox"
          checked={category.isActive}
          onChange={(e) => run(() => updateCategory(category.id, { isActive: e.target.checked }))}
          className="accent-sage"
        />
        Active
      </label>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          run(() => updateCategory(category.id, { name, slug, sortOrder: Number(sortOrder) || 0 }))
        }
        className="rounded-full bg-ink px-3 py-1.5 text-body-xs font-medium text-ivory hover:bg-sage hover:text-ink disabled:opacity-50 transition-colors"
      >
        Save
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => deleteCategory(category.id))}
        className="rounded-full border border-sand px-3 py-1.5 text-body-xs font-medium text-ink hover:border-coral hover:text-coral disabled:opacity-50 transition-colors"
      >
        Delete
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/admin/app/(dashboard)/categories/page.tsx`**

```tsx
import { Metadata } from "next";
import { getAllCategories } from "@e-luna/db";
import { CategoryManager } from "./CategoryManager";

export const metadata: Metadata = { title: "Categories — Luna Ops" };

export default async function CategoriesPage() {
  const categories = await getAllCategories();

  return (
    <div className="max-w-3xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Categories</h2>
      <p className="text-body-md text-mist">The product categories shown across the storefront and vendor product forms.</p>
      <CategoryManager categories={categories} />
    </div>
  );
}
```

- [ ] **Step 4: Add the nav item in `Sidebar.tsx`** — in `NAV_ITEMS`, after the Products entry (`{ icon: "🛍️", label: "Products", href: "/products" },`):
```tsx
  { icon: "🏷️", label: "Categories", href: "/categories" },
```

- [ ] **Step 5: Type-check + lint the admin app**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin
npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -8
npx next lint 2>&1 | tail -5
```
Expected: tsc clean; no new lint errors. (`getAllCategories()` returns the full `Category` rows; the `CategoryManager` `Category` prop type matches the selected fields.)

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/admin/app/actions/categories.ts "apps/admin/app/(dashboard)/categories/page.tsx" "apps/admin/app/(dashboard)/categories/CategoryManager.tsx" "apps/admin/app/(dashboard)/components/Sidebar.tsx"
git commit -m "feat(admin): category management CRUD page + nav

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Vendor product form + validation read the managed list

**Files:** Modify `apps/vendor/app/actions/product.ts`, `apps/vendor/app/(dashboard)/products/components/ProductForm.tsx`, `apps/vendor/app/(dashboard)/products/new/page.tsx`, `apps/vendor/app/(dashboard)/products/[id]/page.tsx`.

- [ ] **Step 1: `product.ts` — import `getCategories`, drop the const, validate against managed slugs**

Change `import { prisma } from "@e-luna/db";` to:
```ts
import { prisma, getCategories } from "@e-luna/db";
```
Delete the two lines:
```ts
const VALID_CATEGORIES = ["OCCASION", "EVERYDAY", "TRAVEL", "SPORT"] as const;
type Category = (typeof VALID_CATEGORIES)[number];
```
In BOTH `createProduct` and `updateProduct`, replace:
```ts
  if (!VALID_CATEGORIES.includes(data.category as Category)) {
    return { success: false, error: "Invalid category" };
  }
```
with:
```ts
  const validSlugs = (await getCategories()).map((c) => c.slug);
  if (!validSlugs.includes(data.category.toLowerCase())) {
    return { success: false, error: "Invalid category" };
  }
```

- [ ] **Step 2: `ProductForm.tsx` — accept a `categories` prop, render from it**

Add the import (type only):
```tsx
import type { CategoryDTO } from "@e-luna/db";
```
Change `Props` to add `categories`:
```tsx
type Props = {
  productId?: string;
  initialData?: InitialData;
  categories: CategoryDTO[];
};
```
Delete the `const CATEGORIES = [...] as const;` block. Change the signature to destructure `categories`:
```tsx
export function ProductForm({ productId, initialData, categories }: Props) {
```
Change the category state initializer:
```tsx
  const [category, setCategory] = useState(initialData?.category ?? "OCCASION");
```
to:
```tsx
  const [category, setCategory] = useState(initialData?.category ?? categories[0]?.slug ?? "");
```
Change the `<select>`'s option map (was `CATEGORIES.map((cat) => (<option key={cat.value} value={cat.value}>{cat.label}</option>))`) to:
```tsx
              {categories.map((cat) => (
                <option key={cat.slug} value={cat.slug}>
                  {cat.name}
                </option>
              ))}
```

- [ ] **Step 3: `products/new/page.tsx` — fetch + pass categories**

Add `import { getCategories } from "@e-luna/db";`, make the component `async` if it isn't, and change `<ProductForm />` to:
```tsx
      <ProductForm categories={await getCategories()} />
```
(If the page component is not already `async`, add `async`: `export default async function ...`.)

- [ ] **Step 4: `products/[id]/page.tsx` — pass categories**

Add `import { getCategories } from "@e-luna/db";` (the page is already `async`). Change `<ProductForm productId={product.id} initialData={initialData} />` to:
```tsx
      <ProductForm productId={product.id} initialData={initialData} categories={await getCategories()} />
```

- [ ] **Step 5: Type-check + lint the vendor app**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor
npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -8
npx next lint 2>&1 | tail -5
```
Expected: tsc clean; no new lint errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/vendor/app/actions/product.ts "apps/vendor/app/(dashboard)/products/components/ProductForm.tsx" "apps/vendor/app/(dashboard)/products/new/page.tsx" "apps/vendor/app/(dashboard)/products/[id]/page.tsx"
git commit -m "feat(vendor): product form + validation read managed categories

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Customer storefront reads the managed list

**Files:** Modify `apps/customer/app/page.tsx`, `apps/customer/app/browse/page.tsx`, `apps/customer/app/browse/[category]/page.tsx`, `apps/customer/app/components/Footer.tsx`.

- [ ] **Step 1: `page.tsx` — managed categories + case-insensitive counts**

Add `getCategories` to the `@e-luna/db` import:
```ts
import { prisma, getCategories } from "@e-luna/db";
```
Delete the `const CATEGORIES = [...]` block (lines 6-11). After the `Promise.all` that produces `categoryStats`, add a fetch of categories and change the count logic. Replace:
```ts
  const countMap = Object.fromEntries(categoryStats.map((c) => [c.category, c._count._all]));
  const categoryCounts = CATEGORIES.map((cat) => ({ ...cat, count: countMap[cat.slug] ?? 0 }));
```
with:
```ts
  const categories = await getCategories();
  const countMap = Object.fromEntries(categoryStats.map((c) => [c.category.toLowerCase(), c._count._all]));
  const categoryCounts = categories.map((cat) => ({ ...cat, count: countMap[cat.slug] ?? 0 }));
```
In the render, change the category card (was using `cat.emoji` + `cat.label`):
```tsx
              <span className="text-2xl text-gold mb-2">{cat.emoji}</span>
              <span className="font-sans text-body-lg font-semibold text-ink">{cat.label}</span>
```
to:
```tsx
              <span className="text-2xl text-gold mb-2">✦</span>
              <span className="font-sans text-body-lg font-semibold text-ink">{cat.name}</span>
```
(The `key={cat.slug}`, `href={/browse?category=${cat.slug}}`, and `{cat.count} abayas` lines are unchanged.) Also update the `HERO_CAMPAIGN.href` if it references a specific category — leave `/browse?category=occasion` (lowercase) or keep as-is; the filter is case-insensitive so no change is required.

- [ ] **Step 2: `browse/page.tsx` — filter category list from the managed list**

Add `getCategories` to the import: `import { prisma, getCategories } from "@e-luna/db";`. Replace the distinct-products category fetch (the first entry of the `Promise.all`):
```ts
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      select: { category: true },
      distinct: ["category"],
    }).then((rows) => rows.map((r) => r.category).sort()).catch(() => [] as string[]),
```
with:
```ts
    getCategories().then((cats) => cats.map((c) => c.name)).catch(() => [] as string[]),
```
(`categories` remains a `string[]` of category names — the filter UI contract is unchanged; the browse filter matches case-insensitively.)

- [ ] **Step 3: `browse/[category]/page.tsx` — validate against managed slugs**

Add `import { getCategories } from "@e-luna/db";`. Delete `const VALID_CATEGORIES = ["occasion", "everyday", "travel", "sport"];`. Replace the guard:
```tsx
  if (!VALID_CATEGORIES.includes(category.toLowerCase())) {
    notFound();
  }
```
with:
```tsx
  const validSlugs = (await getCategories()).map((c) => c.slug);
  if (!validSlugs.includes(category.toLowerCase())) {
    notFound();
  }
```
(This is inside the `async` page component, after `params` is resolved — `category` is already in scope there.)

- [ ] **Step 4: `components/Footer.tsx` — async, links from the managed list**

Add `import { getCategories } from "@e-luna/db";`. Make the component `async` (`export async function Footer(...)` or `export default async function Footer(...)` — match the existing export style). Add `const categories = await getCategories();` at the top of the body. Replace the four hardcoded category `<li>` links:
```tsx
              <li><Link href="/browse?category=Occasion" className="hover:text-ivory transition-colors">Occasion</Link></li>
              <li><Link href="/browse?category=Everyday" className="hover:text-ivory transition-colors">Everyday</Link></li>
              <li><Link href="/browse?category=Travel" className="hover:text-ivory transition-colors">Travel</Link></li>
              <li><Link href="/browse?category=Sport" className="hover:text-ivory transition-colors">Sport</Link></li>
```
with:
```tsx
              {categories.map((cat) => (
                <li key={cat.slug}>
                  <Link href={`/browse?category=${cat.slug}`} className="hover:text-ivory transition-colors">
                    {cat.name}
                  </Link>
                </li>
              ))}
```

- [ ] **Step 5: Type-check + lint the customer app**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/customer
npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -8
npx next lint 2>&1 | tail -5
grep -rn "const CATEGORIES\|VALID_CATEGORIES" apps/customer/app && echo "STALE (bad)" || echo "no stale category consts (good)"
```
Expected: tsc clean; no new lint errors; no stale `CATEGORIES`/`VALID_CATEGORIES` consts in the customer app. (Making `Footer` async is valid — it's a server component rendered inside the async root layout.)

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/page.tsx apps/customer/app/browse/page.tsx "apps/customer/app/browse/[category]/page.tsx" apps/customer/app/components/Footer.tsx
git commit -m "feat(customer): storefront reads managed categories (home/browse/footer)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Repo-wide green check

**Files:** none (verification only).

- [ ] **Step 1: Frozen install + regen**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
pnpm install --frozen-lockfile 2>&1 | tail -3
pnpm --filter @e-luna/db db:generate 2>&1 | tail -2
```
Expected: no lockfile change; regen succeeds.

- [ ] **Step 2: Confirm no stale hardcoded category lists remain**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
grep -rn "VALID_CATEGORIES" apps && echo "STALE (bad)" || echo "no VALID_CATEGORIES (good)"
grep -rn "const CATEGORIES" apps && echo "STALE (bad)" || echo "no hardcoded CATEGORIES (good)"
```
Expected: no matches (all replaced by `getCategories()`).

- [ ] **Step 3: Repo-wide lint**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -12`
Expected: all apps pass (pre-existing `<img>` warnings acceptable).

- [ ] **Step 4: Repo-wide type check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit 2>&1 | tail -12`
Expected: clean (includes `@e-luna/db` with the new categories module).

- [ ] **Step 5: Wiring inspection**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
grep -n "model Category" packages/db/prisma/schema.prisma
grep -rc "getCategories(" apps | grep -v ":0"    # admin(0), vendor + customer files reference it
grep -n 'label: "Categories"' "apps/admin/app/(dashboard)/components/Sidebar.tsx"
```
Expected: the model exists; several `getCategories(` references across vendor + customer; the admin nav item present.

- [ ] **Step 6: Final commit (only if Steps 3-4 required fixes; otherwise skip)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add -A
git commit -m "chore(categories): lint/type fixes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Manual/operator smoke note (not automated)**

`pnpm --filter @e-luna/db db:push` adds `Category` (optionally seed the 4 canonical rows; the fallback covers pre-seed). Smoke (running apps + DB): admin `/categories` add/edit/deactivate a category → it appears/disappears in the vendor product-form dropdown + customer home/browse/footer; a product filed under an existing slug shows under that category in browse; before any rows exist, the storefront shows the 4 default categories (fallback).

---

## Self-Review (completed)

**Spec coverage:**
- `Category` model (slug-based, no FK) → Task 1 ✓
- `getCategories`/`getAllCategories`/`DEFAULT_CATEGORIES` default-fallback → Task 1 ✓
- Admin CRUD (page + `CategoryManager` + actions ADMIN-gated + nav) → Task 2 ✓
- Vendor product form `categories` prop + validation against managed slugs → Task 3 ✓
- Customer home (+ case-insensitive count fix), browse filter list, category-route validation, footer → Task 4 ✓
- Repo-wide green + stale-const removal → Task 5 ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `getCategories(): Promise<CategoryDTO[]>` / `getAllCategories()` / `CategoryDTO {name,slug}` / `DEFAULT_CATEGORIES` defined in Task 1 and consumed consistently in Tasks 3-4. `ProductForm` `categories: CategoryDTO[]` prop (Task 3) matches `getCategories()` passed by both product pages. Admin `CategoryManager` `Category {id,name,slug,sortOrder,isActive}` matches `getAllCategories()` rows and the action signatures (`createCategory`/`updateCategory`/`deleteCategory`). `normalizeSlug` + `P2002` uniqueness handling in one place (Task 2). Slugs are lowercase everywhere; all filters/counts lowercase the stored `product.category`.
```
