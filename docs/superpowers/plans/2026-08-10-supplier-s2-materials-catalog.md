# Supplier S2 — Materials Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an ACTIVE supplier build and manage a catalog of flat, single-SKU material listings (fabric/trim/lining/thread/hardware) with wholesale price, unit, stock, and images — replacing the "Materials — coming soon" dashboard seam with a real `/materials` CRUD section.

**Architecture:** New `Material` Prisma model (a simpler, variant-free sibling of `Product`). Supplier-scoped server actions in `apps/supplier` mirror `apps/vendor/app/actions/product.ts` (ownership + ACTIVE-status checks, slug generation, validation). A `/materials` list + `new`/`[id]` RSC pages + one shared `MaterialForm` client island mirror the vendor products UI.

**Tech Stack:** Turborepo + pnpm@9, Next.js 15 App Router (React 19), Prisma + PostgreSQL (`prisma db push`, NO migration files), Clerk, Tailwind (Warm Oud tokens).

**Spec:** `docs/superpowers/specs/2026-08-10-supplier-s2-materials-catalog-design.md`

---

## Repo Conventions (read before starting)

- **No automated test suite.** Each task's "test" step = regenerate the Prisma client when the schema
  changed, then `tsc --noEmit` and `next lint` on the touched app. That is the real quality gate here.
- Prisma: edit `packages/db/prisma/schema.prisma`, then `pnpm --filter @e-luna/db db:generate` +
  `pnpm --filter @e-luna/db db:push`. The `@e-luna/db` barrel re-exports `prisma` and model/enum types.
  A local Postgres runs at `localhost:5432` (role `postgres` / db `eluna`).
- Server actions return `{ success: boolean; error?: string }` (create also returns `id`).
- DB reads use `.catch(() => fallback)`. `noUncheckedIndexedAccess` is ON.
- Money is Prisma `Decimal`; convert with `Number(...)` when passing to the client, pass a JS `number`
  back into Prisma writes. `images` is Prisma `Json`; store `string[]`, read as `(m.images as string[])`.
- All supplier-app files already exist from S1: `lib/auth.ts` (`safeCurrentUser`), `lib/supplier.ts`
  (`getSupplierByUserId`), `lib/slugify.ts` (`slugify`), `lib/materials.ts` (`MATERIAL_TYPES`).

---

## File Structure

- **`packages/db/prisma/schema.prisma`** (modify) — `MaterialStatus` + `MaterialUnit` enums, `Material`
  model, `Supplier.materials` back-relation.
- **`apps/supplier/app/lib/materials.ts`** (modify) — add `isMaterialType` + `MATERIAL_UNITS`.
- **`apps/supplier/app/actions/material.ts`** (create) — CRUD actions.
- **`apps/supplier/app/(dashboard)/components/MaterialForm.tsx`** (create) — shared create/edit form.
- **`apps/supplier/app/(dashboard)/materials/page.tsx`** (create) — list.
- **`apps/supplier/app/(dashboard)/materials/new/page.tsx`** (create) — new.
- **`apps/supplier/app/(dashboard)/materials/[id]/page.tsx`** (create) — edit.
- **`apps/supplier/app/(dashboard)/components/Sidebar.tsx`** (modify) — promote Materials to a real link.
- **`apps/supplier/app/(dashboard)/page.tsx`** (modify) — live Materials card.

---

### Task 1: Prisma schema — Material model

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the two enums**

Immediately after the existing `SupplierStatus` enum block, add:
```prisma
enum MaterialStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

enum MaterialUnit {
  METER
  YARD
  ROLL
  PIECE
  SPOOL
}
```

- [ ] **Step 2: Add the `Material` model**

Immediately after the closing `}` of the `Supplier` model (the block ending with `@@index([status])`), add:
```prisma
model Material {
  id             String         @id @default(cuid())
  supplierId     String
  name           String
  slug           String         @unique
  materialType   String
  color          String?
  composition    String?
  unit           MaterialUnit
  wholesalePrice Decimal        @db.Decimal(10, 2)
  moq            Int            @default(1)
  stock          Int            @default(0)
  description    String?
  images         Json           @default("[]")
  status         MaterialStatus @default(DRAFT)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  supplier Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)

  @@index([supplierId])
  @@index([status])
  @@index([supplierId, status])
}
```

- [ ] **Step 3: Add the `materials` back-relation on `Supplier`**

In `model Supplier`, add a relation field just before the closing `@@index([status])` line (match the
surrounding alignment):
```prisma
  materials Material[]
```

- [ ] **Step 4: Regenerate + push**

Run:
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter @e-luna/db db:push
```
Expected: generate succeeds; `db:push` prints "Your database is now in sync with your Prisma schema."

- [ ] **Step 5: Verify the Material table exists**

Run:
```bash
psql -h localhost -U postgres -d eluna -tc "SELECT column_name FROM information_schema.columns WHERE table_name='Material' ORDER BY ordinal_position;"
```
Expected: lists `id, supplierId, name, slug, materialType, color, composition, unit, wholesalePrice, moq, stock, description, images, status, createdAt, updatedAt`. (If `psql` prompts for a password, it's `password`; if `psql` is unavailable, skip this step — Step 4's success message is sufficient.)

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add Material model, MaterialStatus and MaterialUnit enums"
```

---

### Task 2: material-type helper + units constant

**Files:**
- Modify: `apps/supplier/app/lib/materials.ts`

- [ ] **Step 1: Append `isMaterialType` and `MATERIAL_UNITS`**

Add to the END of `apps/supplier/app/lib/materials.ts` (keep the existing `MATERIAL_TYPES`,
`MaterialType`, `ALLOWED`, `sanitizeMaterialTypes` exactly as they are):
```ts
/** True if the value is one of the allowed material-type slugs. */
export function isMaterialType(value: string): boolean {
  return ALLOWED.has(value);
}

// Units of sale for a material listing. Values match the Prisma MaterialUnit enum exactly.
export const MATERIAL_UNITS = [
  { value: "METER", label: "Meter" },
  { value: "YARD", label: "Yard" },
  { value: "ROLL", label: "Roll" },
  { value: "PIECE", label: "Piece" },
  { value: "SPOOL", label: "Spool" },
] as const;

export type MaterialUnitValue = (typeof MATERIAL_UNITS)[number]["value"];
```

- [ ] **Step 2: Type-check**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit
```
Expected: no errors. (`ALLOWED` is already module-scoped in this file, so `isMaterialType` can use it.)

- [ ] **Step 3: Commit**

```bash
git add apps/supplier/app/lib/materials.ts
git commit -m "feat(supplier): add isMaterialType helper and MATERIAL_UNITS constant"
```

---

### Task 3: Material CRUD server actions

**Files:**
- Create: `apps/supplier/app/actions/material.ts`

- [ ] **Step 1: Write the actions file**

Create `apps/supplier/app/actions/material.ts` with exactly:
```ts
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
```

- [ ] **Step 2: Type-check**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit
```
Expected: no errors. (`getSupplierByUserId` returns a `status` field — see `lib/supplier.ts`. `prisma.material` exists after Task 1's generate.)

- [ ] **Step 3: Commit**

```bash
git add apps/supplier/app/actions/material.ts
git commit -m "feat(supplier): add supplier-scoped Material CRUD actions"
```

---

### Task 4: MaterialForm client island

**Files:**
- Create: `apps/supplier/app/(dashboard)/components/MaterialForm.tsx`

- [ ] **Step 1: Write the form component**

Create `apps/supplier/app/(dashboard)/components/MaterialForm.tsx` with exactly:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMaterial,
  updateMaterial,
  archiveMaterial,
  deleteMaterial,
  type MaterialData,
} from "../../actions/material";
import { MATERIAL_TYPES, MATERIAL_UNITS } from "../../lib/materials";

export type MaterialFormInitial = MaterialData & { id: string };

type Props = {
  initial?: MaterialFormInitial;
};

const inputCls =
  "w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink";
const labelCls = "text-label text-mist block mb-2";

export function MaterialForm({ initial }: Props) {
  const router = useRouter();
  const isEdit = !!initial;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [materialType, setMaterialType] = useState<string>(
    initial?.materialType ?? MATERIAL_TYPES[0].value
  );
  const [color, setColor] = useState(initial?.color ?? "");
  const [composition, setComposition] = useState(initial?.composition ?? "");
  const [unit, setUnit] = useState<string>(initial?.unit ?? MATERIAL_UNITS[0].value);
  const [wholesalePrice, setWholesalePrice] = useState(
    initial ? String(initial.wholesalePrice) : ""
  );
  const [moq, setMoq] = useState(initial ? String(initial.moq) : "1");
  const [stock, setStock] = useState(initial ? String(initial.stock) : "0");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imagesText, setImagesText] = useState((initial?.images ?? []).join("\n"));
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE">(initial?.status ?? "DRAFT");

  function buildData(): MaterialData {
    return {
      name,
      materialType,
      color: color || undefined,
      composition: composition || undefined,
      unit: unit as MaterialData["unit"],
      wholesalePrice: Number(wholesalePrice),
      moq: Number(moq),
      stock: Number(stock),
      description: description || undefined,
      images: imagesText.split("\n").map((s) => s.trim()).filter(Boolean),
      status,
    };
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const data = buildData();
      const result = isEdit
        ? await updateMaterial(initial!.id, data)
        : await createMaterial(data);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.push("/materials");
      router.refresh();
    });
  }

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveMaterial(initial!.id);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.push("/materials");
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("Delete this material permanently?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteMaterial(initial!.id);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.push("/materials");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="m-name" className={labelCls}>NAME</label>
        <input id="m-name" className={inputCls} value={name} maxLength={80}
          onChange={(e) => setName(e.target.value)} placeholder="e.g. Black Nida Crepe" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="m-type" className={labelCls}>TYPE</label>
          <select id="m-type" className={inputCls} value={materialType}
            onChange={(e) => setMaterialType(e.target.value)}>
            {MATERIAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="m-unit" className={labelCls}>UNIT OF SALE</label>
          <select id="m-unit" className={inputCls} value={unit}
            onChange={(e) => setUnit(e.target.value)}>
            {MATERIAL_UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="m-color" className={labelCls}>COLOR (OPTIONAL)</label>
          <input id="m-color" className={inputCls} value={color}
            onChange={(e) => setColor(e.target.value)} placeholder="e.g. Jet black" />
        </div>
        <div>
          <label htmlFor="m-comp" className={labelCls}>COMPOSITION (OPTIONAL)</label>
          <input id="m-comp" className={inputCls} value={composition}
            onChange={(e) => setComposition(e.target.value)} placeholder="e.g. 100% viscose" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="m-price" className={labelCls}>WHOLESALE PRICE (AED)</label>
          <input id="m-price" type="number" min="0" step="0.01" className={inputCls}
            value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label htmlFor="m-moq" className={labelCls}>MIN ORDER QTY</label>
          <input id="m-moq" type="number" min="1" step="1" className={inputCls}
            value={moq} onChange={(e) => setMoq(e.target.value)} />
        </div>
        <div>
          <label htmlFor="m-stock" className={labelCls}>STOCK</label>
          <input id="m-stock" type="number" min="0" step="1" className={inputCls}
            value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
      </div>

      <div>
        <label htmlFor="m-desc" className={labelCls}>DESCRIPTION (OPTIONAL)</label>
        <textarea id="m-desc" rows={3} className={`${inputCls} resize-none`} value={description}
          maxLength={600} onChange={(e) => setDescription(e.target.value)}
          placeholder="Weight, width, sourcing notes…" />
      </div>

      <div>
        <label htmlFor="m-images" className={labelCls}>IMAGE URLS — ONE PER LINE (OPTIONAL)</label>
        <textarea id="m-images" rows={3} className={`${inputCls} resize-none font-mono text-body-sm`}
          value={imagesText} onChange={(e) => setImagesText(e.target.value)}
          placeholder="https://example.com/swatch.jpg" />
      </div>

      <div>
        <span className={labelCls}>STATUS</span>
        <div className="flex gap-2">
          {(["DRAFT", "ACTIVE"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)}
              className={`rounded-full border px-4 py-2 text-body-sm transition-colors ${
                status === s ? "border-ink bg-ink text-ivory" : "border-sand text-mist hover:border-ink hover:text-ink"
              }`}>
              {s === "DRAFT" ? "Draft" : "Active"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-sm text-coral">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button type="button" onClick={handleSubmit} disabled={isPending || !name.trim()}
          className="rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50">
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create material"}
        </button>
        {isEdit && (
          <>
            <button type="button" onClick={handleArchive} disabled={isPending}
              className="rounded-full border border-sand px-5 py-3 text-body-sm text-mist hover:border-ink hover:text-ink transition-colors disabled:opacity-50">
              Archive
            </button>
            <button type="button" onClick={handleDelete} disabled={isPending}
              className="rounded-full bg-coral/10 px-5 py-3 text-body-sm font-medium text-coral hover:bg-coral/20 transition-colors disabled:opacity-50">
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: no type errors; lint clean.

- [ ] **Step 3: Commit**

```bash
git add "apps/supplier/app/(dashboard)/components/MaterialForm.tsx"
git commit -m "feat(supplier): add MaterialForm create/edit island"
```

---

### Task 5: Materials list, new, and edit pages

**Files:**
- Create: `apps/supplier/app/(dashboard)/materials/page.tsx`
- Create: `apps/supplier/app/(dashboard)/materials/new/page.tsx`
- Create: `apps/supplier/app/(dashboard)/materials/[id]/page.tsx`

- [ ] **Step 1: `materials/page.tsx` (list)**

```tsx
import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";

export const metadata: Metadata = { title: "Materials — Luna Supplier" };

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: "bg-sand text-mist",
  ACTIVE: "bg-gold/20 text-gold",
  ARCHIVED: "bg-coral/10 text-coral",
};

type Props = { searchParams: Promise<{ status?: string }> };

export default async function MaterialsPage({ searchParams }: Props) {
  const { status: statusParam } = await searchParams;

  const user = await safeCurrentUser();
  if (!user) return null;
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return null;

  const validStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"];
  const statusFilter = validStatuses.includes(statusParam ?? "")
    ? (statusParam as "DRAFT" | "ACTIVE" | "ARCHIVED")
    : undefined;

  const materials = await prisma.material
    .findMany({
      where: { supplierId: supplier.id, ...(statusFilter ? { status: statusFilter } : {}) },
      orderBy: { updatedAt: "desc" },
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
        <h2 className="font-display text-display-md text-ink">Materials</h2>
        <Link href="/materials/new"
          className="rounded-full bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors">
          ＋ Add material
        </Link>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => {
          const active = (t.value ?? undefined) === statusFilter;
          const href = t.value ? `/materials?status=${t.value}` : "/materials";
          return (
            <Link key={t.label} href={href}
              className={`rounded-full px-4 py-1.5 text-body-sm transition-colors ${
                active ? "bg-ink text-ivory" : "border border-sand text-mist hover:border-ink hover:text-ink"
              }`}>
              {t.label}
            </Link>
          );
        })}
      </div>

      {materials.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-ivory py-16 text-center">
          <p className="text-body-md text-ink">No materials yet</p>
          <p className="text-body-sm text-mist mt-1">Add your first fabric, trim, or hardware listing.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {materials.map((m) => (
            <Link key={m.id} href={`/materials/${m.id}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-sand bg-ivory p-5 hover:border-ink transition-colors">
              <div className="min-w-0">
                <p className="text-body-md font-medium text-ink truncate">{m.name}</p>
                <p className="text-body-xs text-mist capitalize">
                  {m.materialType}{m.color ? ` · ${m.color}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-5 shrink-0">
                <div className="text-right">
                  <p className="text-body-sm text-ink">
                    AED {Number(m.wholesalePrice).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                    <span className="text-mist"> / {m.unit.toLowerCase()}</span>
                  </p>
                  <p className="text-body-xs text-mist">{m.stock} in stock</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-body-xs font-medium ${STATUS_CLASSES[m.status] ?? "bg-sand text-mist"}`}>
                  {m.status.charAt(0) + m.status.slice(1).toLowerCase()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `materials/new/page.tsx`**

```tsx
import { Metadata } from "next";
import { MaterialForm } from "../../components/MaterialForm";

export const metadata: Metadata = { title: "New material — Luna Supplier" };

export default function NewMaterialPage() {
  return (
    <div className="max-w-3xl">
      <h2 className="font-display text-display-md text-ink mb-6">New material</h2>
      <MaterialForm />
    </div>
  );
}
```

- [ ] **Step 3: `materials/[id]/page.tsx`**

```tsx
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getSupplierByUserId } from "../../../lib/supplier";
import { MaterialForm, type MaterialFormInitial } from "../../components/MaterialForm";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const material = await prisma.material
    .findUnique({ where: { id }, select: { name: true } })
    .catch(() => null);
  return { title: material ? `${material.name} — Luna Supplier` : "Edit material — Luna Supplier" };
}

export default async function EditMaterialPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) redirect("/");

  const material = await prisma.material
    .findUnique({ where: { id } })
    .catch(() => null);

  if (!material || material.supplierId !== supplier.id) notFound();

  const initial: MaterialFormInitial = {
    id: material.id,
    name: material.name,
    materialType: material.materialType,
    color: material.color ?? undefined,
    composition: material.composition ?? undefined,
    unit: material.unit,
    wholesalePrice: Number(material.wholesalePrice),
    moq: material.moq,
    stock: material.stock,
    description: material.description ?? undefined,
    images: (material.images as string[]) ?? [],
    status: material.status === "ARCHIVED" ? "DRAFT" : material.status,
  };

  return (
    <div className="max-w-3xl">
      <h2 className="font-display text-display-md text-ink mb-6">Edit material</h2>
      <MaterialForm initial={initial} />
    </div>
  );
}
```

Note: an ARCHIVED material opens in the form defaulted to DRAFT status (the form only offers
Draft/Active); saving re-publishes or re-drafts it, which is the intended "un-archive by editing" path.

- [ ] **Step 4: Type-check + lint**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: no type errors; lint clean. (`material.unit` is the `MaterialUnit` enum type, assignable to
`MaterialFormInitial.unit` which is `MaterialUnitValue` — the enum's string-literal values match.)

- [ ] **Step 5: Commit**

```bash
git add "apps/supplier/app/(dashboard)/materials"
git commit -m "feat(supplier): add materials list, new, and edit pages"
```

---

### Task 6: Promote the Materials seam + live dashboard card

**Files:**
- Modify: `apps/supplier/app/(dashboard)/components/Sidebar.tsx`
- Modify: `apps/supplier/app/(dashboard)/page.tsx`

- [ ] **Step 1: Sidebar — move Materials from SOON_ITEMS to NAV_ITEMS**

In `apps/supplier/app/(dashboard)/components/Sidebar.tsx`:

Change `NAV_ITEMS` from:
```tsx
const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard", href: "/" },
] as const;
```
to:
```tsx
const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard", href: "/" },
  { icon: "🧵", label: "Materials", href: "/materials" },
] as const;
```

And change `SOON_ITEMS` from:
```tsx
const SOON_ITEMS = [
  { icon: "🧵", label: "Materials" },
  { icon: "📋", label: "Incoming Orders" },
] as const;
```
to:
```tsx
const SOON_ITEMS = [
  { icon: "📋", label: "Incoming Orders" },
] as const;
```

- [ ] **Step 2: Dashboard home — make the Materials card live**

In `apps/supplier/app/(dashboard)/page.tsx`, add a materials count query and turn the first
"COMING SOON" card into a link.

After the existing `const supplier = await getSupplierByUserId(user.id);` guard block (right after
`if (!supplier) return null;`), add:
```tsx
  const materialCount = await prisma.material
    .count({ where: { supplierId: supplier.id } })
    .catch(() => 0);
```
And add the import at the top (alongside the existing imports):
```tsx
import Link from "next/link";
import { prisma } from "@e-luna/db";
```

Then replace the first card (the "Materials catalog" COMING SOON `div`) with:
```tsx
        <Link
          href="/materials"
          className="rounded-2xl border border-sand bg-ivory p-6 hover:border-ink transition-colors"
        >
          <p className="text-label text-gold mb-1">CATALOG</p>
          <p className="text-body-md font-medium text-ink">Materials</p>
          <p className="text-body-sm text-mist mt-1">
            {materialCount === 0
              ? "Add fabrics, trims, and hardware with wholesale pricing."
              : `${materialCount} material${materialCount === 1 ? "" : "s"} listed. Manage your catalog →`}
          </p>
        </Link>
```
Leave the second card ("Incoming orders" COMING SOON) unchanged.

- [ ] **Step 3: Type-check + lint**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: no type errors; lint clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/supplier/app/(dashboard)/components/Sidebar.tsx" "apps/supplier/app/(dashboard)/page.tsx"
git commit -m "feat(supplier): promote Materials nav + make dashboard card live"
```

---

### Task 7: Full-workspace verification

- [ ] **Step 1: Regenerate client + full type-check**

Run:
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter "@e-luna/*" exec tsc --noEmit
```
Expected: no type errors across all packages/apps.

- [ ] **Step 2: Full lint**

Run:
```bash
pnpm lint
```
Expected: all apps lint clean (pre-existing `<img>` warnings in the customer app are acceptable).

- [ ] **Step 3: Nothing to commit if clean**

If Steps 1–2 produced no changes, there's nothing to commit — the feature is complete. If a
regeneration touched a file, commit it:
```bash
git add -A && git commit -m "chore(supplier): sync generated artifacts for materials catalog"
```

---

## Self-Review

**Spec coverage:**
- `MaterialStatus`/`MaterialUnit` enums + `Material` model + `Supplier.materials` → Task 1. ✅
- `isMaterialType` + `MATERIAL_UNITS` in `lib/materials.ts` → Task 2. ✅
- Supplier-scoped `createMaterial`/`updateMaterial`/`archiveMaterial`/`deleteMaterial` with ownership +
  ACTIVE-status checks + validation + slug generation → Task 3. ✅
- Shared `MaterialForm` (create/edit, archive/delete in edit) → Task 4. ✅
- `/materials` list (status filter, empty state), `new`, `[id]` (ownership → `notFound`) → Task 5. ✅
- Sidebar Materials promoted to real link; dashboard Materials card live → Task 6. ✅
- Verification (generate + tsc + lint) → each task + Task 7. ✅
- Deferred (vendor browse, MaterialOrder, MOQ enforcement) → correctly absent. ✅

**Placeholder scan:** No TBD/TODO; every code step has full contents or an exact anchored edit.

**Type consistency:** `MaterialData` (Task 3) is imported and built by `MaterialForm` (Task 4);
`MaterialFormInitial = MaterialData & { id }` consumed by the `[id]` page (Task 5). `MaterialUnitValue`
(Task 2) is the `unit` type across `MaterialData`, the form, and the edit page. Action names
(`createMaterial`/`updateMaterial`/`archiveMaterial`/`deleteMaterial`) defined in Task 3, imported in
Task 4. `prisma.material` used in Tasks 3, 5, 6 — available after Task 1's generate. `getSupplierByUserId`
returns `{ id, status, ... }` (from S1 `lib/supplier.ts`) — used for both scoping and the ACTIVE check.

**Scope:** single app + one model; no decomposition needed.
