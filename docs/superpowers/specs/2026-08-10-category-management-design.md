# Category Management — Design Spec

## Goal

Replace the three inconsistent hardcoded category lists (vendor `["OCCASION"…]`, customer home `Occasion/…`, browse route `["occasion"…]`) with a single admin-managed `Category` table. Admins define the canonical list; the vendor product form + validation and the customer storefront (home, browse, category route, footer) all read from it. `Product.category` stays a slug string (no FK, no data migration); a default-fallback keeps everything working before the table is populated.

---

## Scope

**In scope:** `Category` model + `getCategories`/`getAllCategories` helpers in `@e-luna/db`; admin categories CRUD (page + actions + nav); vendor product form/validation reads the managed list; customer home/browse/category-route/footer read it.

**Out of scope (deferred / YAGNI):** foreign-key linkage / migrating `Product.category` to `categoryId`; category images, descriptions, or nested subcategories; per-vendor categories; renaming a slug and mass-updating existing products' stored strings (products keep their string; the browse filter is case-insensitive).

---

## Architecture

### Current state (verified)
- `Product.category` is a free-form `String` (line 222). No `Category` model.
- **Three hardcoded lists (inconsistent casing):** vendor `apps/vendor/app/actions/product.ts:9` `VALID_CATEGORIES = ["OCCASION","EVERYDAY","TRAVEL","SPORT"]` (used in both `createProduct` ~line 74 and `updateProduct` ~line 143 as `if (!VALID_CATEGORIES.includes(data.category as Category))`); vendor `ProductForm.tsx` client component has a hardcoded `CATEGORIES` const + default `"OCCASION"` (select at lines 154-164); customer `page.tsx:6` `CATEGORIES` (title-case slugs + emoji); customer `browse/[category]/page.tsx:4` `VALID_CATEGORIES = ["occasion",…]`; customer `components/Footer.tsx` four hardcoded `?category=Occasion` links.
- Customer filtering is case-insensitive (`category: { equals, mode: "insensitive" }`) in `browse/page.tsx` + `ProductGrid.tsx`, which papers over the casing mismatch.
- Home `page.tsx` counts: `groupBy(["category"])` → `countMap` keyed by `c.category` (stored value), looked up by `cat.slug` (title-case) — a **latent mismatch** (counts can read 0). This phase fixes it by keying case-insensitively.
- `ProductForm` is rendered by server pages `products/new/page.tsx` (`<ProductForm />`) and `products/[id]/page.tsx` (`<ProductForm productId initialData />`).
- `Footer` is rendered in `apps/customer/app/layout.tsx:61`.
- `packages/db` barrel exports `prisma` + `@prisma/client`; dep of all apps. Prisma accessor: `prisma.category`. Admin actions gate via `getAuthUser()` (`user.role !== "ADMIN"`).

### Schema (additive, `db push`)
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
`Product.category` unchanged (stores the slug). No FK.

### Helper — `packages/db/src/categories.ts` (exported from the barrel)
```ts
import { prisma } from "./client";

export type CategoryDTO = { name: string; slug: string };

export const DEFAULT_CATEGORIES: CategoryDTO[] = [
  { name: "Occasion", slug: "occasion" },
  { name: "Everyday", slug: "everyday" },
  { name: "Travel", slug: "travel" },
  { name: "Sport", slug: "sport" },
];

/** Active categories (sorted) for storefront + vendor form; DEFAULT_CATEGORIES fallback when empty / on error. */
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

/** All categories incl. inactive, for the admin CRUD. */
export async function getAllCategories() {
  return prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }).catch(() => []);
}
```
Slugs are canonical **lowercase**. Fallback → the customer/vendor surfaces never break before the table is seeded/populated. `packages/db/src/index.ts` adds `export * from "./categories";`.

### Files
```
packages/db/prisma/schema.prisma                               — Category model
packages/db/src/categories.ts                                   — CREATE helper + defaults
packages/db/src/index.ts                                        — export * from "./categories"
apps/admin/app/actions/categories.ts                            — CREATE create/update/delete (ADMIN-gated)
apps/admin/app/(dashboard)/categories/page.tsx                  — CREATE list page
apps/admin/app/(dashboard)/categories/CategoryManager.tsx      — CREATE client CRUD
apps/admin/app/(dashboard)/components/Sidebar.tsx              — add "Categories" nav item
apps/vendor/app/actions/product.ts                             — validate against managed slugs
apps/vendor/app/(dashboard)/products/components/ProductForm.tsx — categories prop
apps/vendor/app/(dashboard)/products/new/page.tsx              — fetch + pass categories
apps/vendor/app/(dashboard)/products/[id]/page.tsx            — fetch + pass categories
apps/customer/app/page.tsx                                     — getCategories + case-insensitive counts
apps/customer/app/browse/page.tsx                             — filter list from getCategories
apps/customer/app/browse/[category]/page.tsx                  — validate against managed slugs
apps/customer/app/components/Footer.tsx                       — async, links from getCategories
```

---

## Admin management

### `apps/admin/app/actions/categories.ts`
`"use server"`. Each action gates `getAuthUser()` (Unauthorized/Forbidden). Slug normalized (`lower`, non-alphanumeric → `-`, trim `-`); uniqueness via the `@unique` constraint (`Prisma.PrismaClientKnownRequestError` code `P2002` → `"Slug already in use"`).
- `createCategory({ name, slug?, sortOrder? })` — slug defaults from name; `prisma.category.create`.
- `updateCategory(id, { name?, slug?, sortOrder?, isActive? })` — partial update.
- `deleteCategory(id)` — `prisma.category.delete` (safe: no FK; products keep their string).
Returns `{ success: true } | { error: string }`.

### `categories/page.tsx` + `CategoryManager.tsx`
Server page fetches `getAllCategories()` and renders `<CategoryManager categories={...} />`. The client `CategoryManager` shows an **Add** row (name + optional slug + sortOrder) and a list of existing categories, each with editable name/slug/sortOrder, an **Active** toggle, and Save/Delete — each calling the matching action with inline feedback + `router.refresh()`. `Sidebar.tsx` gets a `{ icon: "🏷️", label: "Categories", href: "/categories" }` nav item.

---

## Vendor wiring

- **`ProductForm.tsx`**: add a `categories: CategoryDTO[]` prop; the category `<select>` maps over it (`value={c.slug}`, label `{c.name}`); the initial category is `initialData?.category ?? categories[0]?.slug ?? ""`. Remove the hardcoded `CATEGORIES` const.
- **`products/new/page.tsx`** + **`products/[id]/page.tsx`**: `const categories = await getCategories();` and pass `categories={categories}` to `<ProductForm />`.
- **`actions/product.ts`**: remove `VALID_CATEGORIES`/`Category`; add `import { getCategories } from "@e-luna/db";`; in both `createProduct` and `updateProduct` replace the guard with:
  ```ts
  const validSlugs = (await getCategories()).map((c) => c.slug);
  if (!validSlugs.includes(data.category.toLowerCase())) {
    return { success: false, error: "Invalid category" };
  }
  ```

---

## Customer wiring

- **`page.tsx`**: replace the `CATEGORIES` const with `const categories = await getCategories();`. Fix the counts to be case-insensitive:
  ```ts
  const countMap = Object.fromEntries(categoryStats.map((c) => [c.category.toLowerCase(), c._count._all]));
  const categoryCounts = categories.map((cat) => ({ ...cat, count: countMap[cat.slug] ?? 0 }));
  ```
  Render `categoryCounts` (name + count; link `?category=${cat.slug}`). (The emoji is dropped — managed categories have no emoji.)
- **`browse/page.tsx`**: source the filter's category options from `await getCategories()` (names/slugs) instead of the distinct-product-strings query.
- **`browse/[category]/page.tsx`**: validate the route param against `(await getCategories()).map(c => c.slug)` (case-insensitive) instead of the local `VALID_CATEGORIES`.
- **`components/Footer.tsx`**: make it an `async` server component; `const categories = await getCategories();` render the categories as `?category=<slug>` links (replacing the four hardcoded links).
- **`p/[slug]/page.tsx`**: unchanged — the "browse this category" link keeps the product's stored string (filter is case-insensitive).

---

## Error Handling

- Admin actions ADMIN-gated; slug normalized + unique (`P2002` → friendly error); delete safe (no FK).
- **`getCategories` `.catch` → `DEFAULT_CATEGORIES`** — vendor form + all storefront surfaces work even on a DB error or an empty table (no broken nav on fresh deploy).
- Vendor product validation rejects an unmanaged category slug with a clear message.
- Casing: managed slugs are lowercase; all comparisons/counts lowercase the stored `product.category`, so legacy uppercase values keep matching.

---

## Testing

No automated suite (repo-consistent). Per task:
```bash
pnpm --filter @e-luna/db db:generate                                       # regen client for Category
cd apps/admin    && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"    # clean
cd apps/vendor   && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"    # clean
cd apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"    # clean
# lint all three apps
```
Final task: repo-wide `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit`.

**Operator:** `pnpm --filter @e-luna/db db:push` to add `Category` (optionally seed the 4 canonical rows; the fallback covers pre-seed). **Manual smoke (DB):** admin `/categories` add "Modest Formals" → it appears in the vendor product-form dropdown and the customer footer/home; a product filed under an existing slug shows under that category in browse; toggling a category inactive removes it from the storefront nav (products keep their string).

---

## Boundary

`Product.category` remains a slug string — a future phase could migrate to a `categoryId` FK (with a backfill) if referential integrity becomes necessary. Adding a category is now an admin action; adding a new *field* to categories (image, parent) would be a schema extension. This phase deliberately keeps the model flat and migration-free.
