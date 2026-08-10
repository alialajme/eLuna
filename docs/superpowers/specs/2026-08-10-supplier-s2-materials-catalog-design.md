# Supplier S2 — Materials Catalog Design

**Status:** Approved (brainstorming) — 2026-08-10
**Phase:** Supplier S2 (second of the 3-phase Supplier build: S1 Foundation ✅ → **S2 Materials Catalog** → S3 Sourcing & Orders)

## Goal

Give an approved supplier the ability to build and manage a catalog of the materials they sell
(fabrics, trims, lining, thread, hardware) — each a flat, single-SKU listing with a wholesale price,
unit of sale, stock, and images. This replaces the "Materials — coming soon" seam in the supplier
dashboard with a real `/materials` CRUD section.

**Success criteria:** an ACTIVE supplier can create, edit, archive, and delete material listings from
their dashboard; listings are strictly scoped to the owning supplier (no supplier can read or mutate
another's materials); a suspended/pending supplier cannot manage a catalog.

**Explicitly NOT in S2 (deferred to S3):** any vendor-facing browse of materials, `MaterialOrder`,
ordering/fulfillment, MOQ enforcement, supplier payouts. S2 builds the catalog; S3 exposes and
transacts it.

## Context & Rationale

- Supplier S1 shipped the `Supplier` model, the `supply.luna.ae` app, onboarding, admin approval, and
  a dashboard shell with two "coming soon" seams (Materials, Incoming Orders). S2 fills the Materials seam.
- `Material` is a deliberately simpler sibling of the vendor `Product` model. Per the brainstorming
  decision, **each material is one flat listing per SKU** (e.g. "Black Nida Crepe" and "Navy Nida Crepe"
  are two listings) — **no `Product → ProductVariant`-style sub-variants**. This roughly halves the
  schema + CRUD surface and maps cleanly onto how S3 vendors will order by the unit.
- The supplier CRUD mirrors the existing vendor products pattern
  (`apps/vendor/app/(dashboard)/products` list + `new`/`[id]` forms + `actions/product.ts`), scoped to
  the signed-in supplier. Reusing that shape keeps S2 low-risk.

## Data Model (Prisma — repo uses `prisma db push`, NO migration files)

All changes in `packages/db/prisma/schema.prisma`.

1. **New `enum MaterialStatus`:**
   ```prisma
   enum MaterialStatus {
     DRAFT
     ACTIVE
     ARCHIVED
   }
   ```
   No `REJECTED` — there is no per-material admin moderation in S2 (suppliers are vetted at account
   approval in S1). DRAFT = not yet published; ACTIVE = live in the catalog; ARCHIVED = retired.

2. **New `enum MaterialUnit`:**
   ```prisma
   enum MaterialUnit {
     METER
     YARD
     ROLL
     PIECE
     SPOOL
   }
   ```

3. **New `model Material`:**
   ```prisma
   model Material {
     id             String         @id @default(cuid())
     supplierId     String
     name           String
     slug           String         @unique
     materialType   String         // one of MATERIAL_TYPES: fabric/trim/lining/thread/hardware
     color          String?
     composition    String?        // e.g. "100% viscose"
     unit           MaterialUnit
     wholesalePrice Decimal        @db.Decimal(10, 2)
     moq            Int            @default(1)   // minimum order qty — catalog attribute; S3 enforces
     stock          Int            @default(0)
     description    String?
     images         Json           @default("[]") // array of URL strings, like Product.aiImages
     status         MaterialStatus @default(DRAFT)
     createdAt      DateTime       @default(now())
     updatedAt      DateTime       @updatedAt

     supplier Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)

     @@index([supplierId])
     @@index([status])
     @@index([supplierId, status])
   }
   ```

4. **`model Supplier`** — add the back-relation:
   ```prisma
   materials Material[]
   ```

Regenerate offline: `pnpm --filter @e-luna/db db:generate`; apply: `pnpm --filter @e-luna/db db:push`.
`MaterialStatus`, `MaterialUnit`, and the `Material` type re-export through the `@e-luna/db` barrel.

## Shared material-type list

The onboarding material-type list already lives at `apps/supplier/app/lib/materials.ts`
(`MATERIAL_TYPES` = fabric/trim/lining/thread/hardware, plus `sanitizeMaterialTypes`). The material
form's "type" selector and the `createMaterial`/`updateMaterial` validation reuse this same constant —
a material's `materialType` must be one of these values. Add a small helper
`isMaterialType(value: string): boolean` to that file (checks membership in the allowlist) so the
actions can validate a single value cleanly.

Add a units constant next to it (in `apps/supplier/app/lib/materials.ts`):
```ts
export const MATERIAL_UNITS = [
  { value: "METER", label: "Meter" },
  { value: "YARD", label: "Yard" },
  { value: "ROLL", label: "Roll" },
  { value: "PIECE", label: "Piece" },
  { value: "SPOOL", label: "Spool" },
] as const;
```
(These string values match the `MaterialUnit` enum exactly.)

## Server Actions — `apps/supplier/app/actions/material.ts`

Pattern mirrors `apps/vendor/app/actions/product.ts` but scoped to the supplier and simpler (no variants).

Shared input type:
```ts
export type MaterialData = {
  name: string;
  materialType: string;
  color?: string;
  composition?: string;
  unit: "METER" | "YARD" | "ROLL" | "PIECE" | "SPOOL";
  wholesalePrice: number;
  moq: number;
  stock: number;
  description?: string;
  images: string[];
  status: "DRAFT" | "ACTIVE"; // ARCHIVED is reached via archiveMaterial, not the form
};
```

Every action:
1. `const user = await safeCurrentUser()` → `getSupplierByUserId(user.id)`. If no user or no supplier →
   `{ success: false, error: "Not a supplier" }`.
2. **Require `supplier.status === "ACTIVE"`** → otherwise `{ success: false, error: "Your supplier account is not active" }`
   (a pending/suspended/rejected supplier cannot manage a catalog).
3. For mutations on an existing material, load it and verify `material.supplierId === supplier.id`
   (ownership) → otherwise `{ success: false, error: "Not found" }`.

Actions:
- **`createMaterial(data: MaterialData)`** — validate (see below), generate a unique slug from `name`
  (collision suffix `-2`, `-3`, … like `generateSlug` in product.ts), `prisma.material.create` with
  `supplierId`. Returns `{ success: true, id }`.
- **`updateMaterial(id: string, data: MaterialData)`** — ownership-check, validate, update (keep the
  existing slug; do not regenerate on rename to preserve any links). Returns `{ success: true }`.
- **`archiveMaterial(id: string)`** — ownership-check, set `status: "ARCHIVED"`. Returns `{ success: true }`.
- **`deleteMaterial(id: string)`** — ownership-check, `prisma.material.delete`. Returns `{ success: true }`.

Validation (shared helper in the action file):
- `name` trimmed length 2–80.
- `materialType` passes `isMaterialType`.
- `unit` ∈ the five `MaterialUnit` values.
- `wholesalePrice` is a finite number `> 0`.
- `moq` is an integer `>= 1`; `stock` is an integer `>= 0`.
- `images` — filter to non-empty trimmed strings (URLs); cap at 8.
- `status` ∈ {DRAFT, ACTIVE}.
On failure return `{ success: false, error }`. Wrap DB writes; on `P2002` (slug) retry-suffix already
prevents it, but catch defensively and return a friendly error. All list/read queries use `.catch`.

## Dashboard UI (`apps/supplier/app/(dashboard)`)

- **`materials/page.tsx`** (RSC) — resolve supplier, `prisma.material.findMany({ where: { supplierId },
  orderBy: { updatedAt: "desc" } })` (`.catch(() => [])`). Render a table/cards: name, type, color,
  `AED {wholesalePrice} / {unit}`, stock, status badge, edit link. A status filter (All/Draft/Active/
  Archived) reusing the same lightweight pattern as the vendor products list. "＋ Add material" CTA →
  `/materials/new`. Empty state when none.
- **`materials/new/page.tsx`** (RSC) — renders `<MaterialForm mode="create" />`.
- **`materials/[id]/page.tsx`** (RSC) — load the material (ownership-checked; `notFound()` if missing or
  not owned), render `<MaterialForm mode="edit" material={...} />` plus Archive/Delete controls.
- **`components/MaterialForm.tsx`** (client island) — fields: name, type (select from `MATERIAL_TYPES`),
  color, composition, unit (select from `MATERIAL_UNITS`), wholesale price, MOQ, stock, description,
  image URLs (repeatable text inputs — same simple approach as the S1 logo URL / vendor image URLs),
  and a Draft/Active toggle. Calls `createMaterial`/`updateMaterial` via `useTransition`; shows inline
  errors; on success `router.push("/materials")`. In edit mode, Archive calls `archiveMaterial` and
  Delete calls `deleteMaterial` (with a confirm) then routes back to the list.
- **`components/Sidebar.tsx`** — promote the Materials entry from a disabled "soon" item to a real
  `NAV_ITEMS` link (`{ icon: "🧵", label: "Materials", href: "/materials" }`); keep "📋 Incoming Orders"
  in the `SOON_ITEMS` list (S3 seam).
- **Dashboard home `(dashboard)/page.tsx`** — update the "Materials catalog — COMING SOON" card to a live
  card linking to `/materials` (e.g. show the count of the supplier's materials). Leave the "Incoming
  orders" card as a COMING SOON seam.

## Data Flow

1. ACTIVE supplier → `/materials` → "Add material" → `MaterialForm` (create) → `createMaterial`
   (supplier-scoped; DRAFT or ACTIVE) → back to `/materials`.
2. Edit → `/materials/[id]` → `MaterialForm` (edit) → `updateMaterial` / `archiveMaterial` / `deleteMaterial`.
3. No external consumer in S2. S3 will add vendor browse of ACTIVE materials + `MaterialOrder`.

## Error Handling

- Actions return `{ success: boolean; error?: string }` (create also returns `id`), matching repo
  convention; ownership + `status === "ACTIVE"` checks guard every mutation server-side.
- DB reads `.catch(() => fallback)`; slug collisions handled by numeric-suffix generation + defensive
  `P2002` catch.
- `[id]` page uses `notFound()` when the material is missing or not owned by the current supplier.

## Testing

No automated suite in this repo — verification is types + lint + manual:
1. `pnpm --filter @e-luna/db db:generate` (regenerate client with `Material`/`MaterialStatus`/`MaterialUnit`).
2. `pnpm --filter "@e-luna/*" exec tsc --noEmit` — clean.
3. `pnpm lint` — clean (supplier app included).
4. gitleaks — clean.
5. Manual: as an ACTIVE supplier, create → edit → archive → delete a material; confirm the list reflects
   each; confirm a second supplier cannot load or mutate the first supplier's `/materials/[id]`
   (ownership → `notFound`/error); confirm a PENDING/SUSPENDED supplier is blocked from mutations.

## File Summary

- Modify: `packages/db/prisma/schema.prisma` (enums + `Material` model + `Supplier.materials`)
- Modify: `apps/supplier/app/lib/materials.ts` (`isMaterialType`, `MATERIAL_UNITS`)
- Create: `apps/supplier/app/actions/material.ts`
- Create: `apps/supplier/app/(dashboard)/materials/page.tsx`
- Create: `apps/supplier/app/(dashboard)/materials/new/page.tsx`
- Create: `apps/supplier/app/(dashboard)/materials/[id]/page.tsx`
- Create: `apps/supplier/app/(dashboard)/components/MaterialForm.tsx`
- Modify: `apps/supplier/app/(dashboard)/components/Sidebar.tsx` (promote Materials to a real link)
- Modify: `apps/supplier/app/(dashboard)/page.tsx` (live Materials card)
- Add a `getMaterialsBySupplier` helper if it de-duplicates list/read logic (optional; keep in
  `apps/supplier/app/lib/supplier.ts` or a new `lib/material.ts` if it grows).
