# Phase 5: Luna Studio AI — Design Spec

## Goal

Give vendors a 3-photo upload wizard that uses Claude to detect garment details and write bilingual product copy (English + Arabic), with AI image generation stubbed for a future phase.

---

## Scope

| Route | Description |
|-------|-------------|
| `/studio` | Campaign list — past StudioUpload sessions |
| `/studio/new` | Upload wizard — 3 photo slots, triggers AI pipeline |
| `/studio/[id]` | Results page — garment tags, copy, source photos, image placeholder |

**In scope:** Photo upload, garment detection (real Claude vision), copy generation (real Claude text), results display.
**Out of scope:** Real AI image/video generation (stubbed), Cloudinary integration (data URLs used for now), "Use this copy →" pre-fill wiring to product form (link rendered but not functional), RTL layout toggle.

---

## File Structure

```
apps/vendor/app/
├── (dashboard)/
│   └── studio/
│       ├── page.tsx                     — RSC, campaign list
│       ├── new/
│       │   └── page.tsx                 — "use client", upload wizard
│       ├── [id]/
│       │   └── page.tsx                 — RSC, results
│       └── components/
│           ├── StudioUploader.tsx       — "use client", 3-slot file input with preview
│           └── CopyPanel.tsx            — "use client", EN + AR copy display with refresh
├── actions/
│   └── studio.ts                        — "use server": createStudioUpload, triggerStudioPipeline
└── api/
    └── studio/
        └── upload/
            └── route.ts                 — POST, accepts 3 files, returns base64 data URLs

packages/ai/src/agents/studio.ts         — implement detect_garment + write_copy with real Claude calls
```

No new pages in other apps. No schema changes — `StudioUpload` model already exists.

---

## Data Model

```
StudioUpload
  id              String   (cuid)
  vendorId        String
  sourceImages    Json     @default("[]")      // string[] of data URLs or future CDN URLs
  generatedAssets Json     @default("{}")      // See shape below
  status          String   @default("PENDING") // PENDING | PROCESSING | COMPLETE | FAILED
  productId       String?
  createdAt       DateTime
  updatedAt       DateTime
```

**`generatedAssets` shape when COMPLETE:**
```ts
{
  garment: {
    garmentType: string;
    color: string;
    fabric: string;
    style: string;
    details: string[];
  };
  copy: {
    titleEn: string;
    titleAr: string;
    descriptionEn: string;
    descriptionAr: string;
    tags: string[];
  };
}
```

**`generatedAssets` shape when FAILED:**
```ts
{ error: string }
```

---

## API Route — `app/api/studio/upload/route.ts`

`POST /api/studio/upload` — `multipart/form-data`, fields `photo0`, `photo1`, `photo2`.

```ts
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export async function POST(req: NextRequest) {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const urls: string[] = [];

  for (const key of ["photo0", "photo1", "photo2"]) {
    const file = formData.get(key) as File | null;
    if (!file) return NextResponse.json({ error: `Missing ${key}` }, { status: 400 });
    if (file.size > 10 * 1024 * 1024)
      return NextResponse.json({ error: `${key} exceeds 10 MB` }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    urls.push(`data:${mimeType};base64,${base64}`);
  }

  return NextResponse.json({ urls });
}
```

---

## Server Actions — `app/actions/studio.ts`

```ts
"use server"
import { revalidatePath } from "next/cache";
import { generateText } from "ai";
import { prisma } from "@e-luna/db";
import { anthropic, LUNA_MODEL } from "@e-luna/ai";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";
```

### `createStudioUpload`

```ts
export async function createStudioUpload(
  sourceImageUrls: string[]
): Promise<{ id: string } | { error: string }>
```

**Logic:**
1. `safeCurrentUser()` → null → `{ error: "Unauthorized" }`
2. `getVendorByUserId(user.id)` → null → `{ error: "Vendor not found" }`
3. `prisma.studioUpload.create({ data: { vendorId: vendor.id, sourceImages: sourceImageUrls, status: "PENDING" } })`
4. Returns `{ id: record.id }`

### `triggerStudioPipeline`

```ts
export async function triggerStudioPipeline(
  uploadId: string
): Promise<{ success: boolean; error?: string }>
```

**Logic:**
1. Auth guard: `safeCurrentUser()` → null → `{ success: false, error: "Unauthorized" }`
2. Vendor guard: `getVendorByUserId(user.id)` → null → `{ success: false, error: "Vendor not found" }`
3. Fetch upload: `prisma.studioUpload.findUnique({ where: { id: uploadId } })` → null → `{ success: false, error: "Not found" }`
4. Ownership: `upload.vendorId !== vendor.id` → `{ success: false, error: "Unauthorized" }`
5. Set `status = "PROCESSING"`
6. Call `detectGarment(sourceImages)` — real Claude vision call (see AI section)
7. Call `writeCopy(garmentResult)` — real Claude text call (see AI section)
8. Update `generatedAssets = { garment, copy }`, `status = "COMPLETE"`
9. `revalidatePath("/studio")` + `revalidatePath(`/studio/${uploadId}`)`
10. Returns `{ success: true }`

**Error handling:** Wrap steps 6–8 in try/catch. On catch: update `generatedAssets = { error: err.message }`, `status = "FAILED"`, revalidate, return `{ success: false, error: err.message }`.

---

## AI Package — `packages/ai/src/agents/studio.ts`

Replace stub tool `execute` functions with real Claude calls. Export two standalone helpers used by the server action:

### `detectGarment`

```ts
export async function detectGarment(imageUrls: string[]): Promise<{
  garmentType: string;
  color: string;
  fabric: string;
  style: string;
  details: string[];
}>
```

**Implementation:**
```ts
const { text } = await generateText({
  model: anthropic(LUNA_MODEL),
  messages: [
    {
      role: "user",
      content: [
        ...imageUrls.map((url) => ({ type: "image" as const, image: url })),
        {
          type: "text",
          text: `Analyze these abaya photos. Return JSON only (no markdown):
{
  "garmentType": "e.g. Overhead Abaya",
  "color": "e.g. Midnight Black",
  "fabric": "e.g. Silk blend",
  "style": "e.g. Floral embroidery",
  "details": ["detail1", "detail2"]
}`,
        },
      ],
    },
  ],
});
return JSON.parse(text);
```

### `writeCopy`

```ts
export async function writeCopy(garment: {
  garmentType: string;
  color: string;
  fabric: string;
  style: string;
  details: string[];
}): Promise<{
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  tags: string[];
}>
```

**Implementation:**
```ts
const { text } = await generateText({
  model: anthropic(LUNA_MODEL),
  prompt: `You are a luxury Gulf fashion copywriter. Write product copy for this abaya:
${JSON.stringify(garment)}

Return JSON only (no markdown):
{
  "titleEn": "product title in English (max 60 chars)",
  "titleAr": "product title in Arabic (max 60 chars)",
  "descriptionEn": "2-3 sentence marketing description in English",
  "descriptionAr": "2-3 sentence marketing description in Arabic",
  "tags": ["tag1", "tag2", "tag3"]
}`,
});
return JSON.parse(text);
```

---

## `/studio` List Page

RSC. Auth guard → vendor guard.

```ts
const uploads = await prisma.studioUpload.findMany({
  where: { vendorId: vendor.id },
  orderBy: { createdAt: "desc" },
}).catch(() => []);
```

**Layout:**
- Header: "Luna Studio" h2 + "✦ New Campaign" button (→ `/studio/new`)
- Subtitle: "Upload 3 photos of your abaya — Luna AI detects the garment and writes your full product copy."
- Campaign cards: thumbnail strip (3 grey squares if sourceImages empty, else `<img>` from first 3 URLs), name (from `generatedAssets.copy.titleEn` or "Untitled Campaign"), date, status badge, "View →" link
- Empty state: "No campaigns yet. Upload your first product photos to get started."

**Status badge colours:**
- PENDING → `bg-sand text-mist`
- PROCESSING → `bg-gold/20 text-gold`
- COMPLETE → `bg-sage/20 text-sage`
- FAILED → `bg-coral/20 text-coral`

---

## `/studio/new` Upload Wizard

`"use client"`. No RSC props needed.

**State:**
```ts
const [files, setFiles] = useState<(File | null)[]>([null, null, null]);
const [previews, setPreviews] = useState<(string | null)[]>([null, null, null]);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Slot labels:** `["Front view", "Back view", "Detail / fabric"]`

**On file select:** validate type (`image/*`) and size (≤ 10 MB), create object URL for preview with `URL.createObjectURL(file)`, store in `files[i]` and `previews[i]`.

**On submit** (all 3 files filled):
1. `setIsLoading(true)`
2. Build `FormData` with `photo0`, `photo1`, `photo2`
3. `fetch("/api/studio/upload", { method: "POST", body: formData })` → `{ urls }`
4. Call `createStudioUpload(urls)` → `{ id }` or `{ error }`
5. Call `triggerStudioPipeline(id)` (fire-and-forget — don't await completion)
6. `router.push(`/studio/${id}`)`

**Generate button:** disabled and grey until `files.every(Boolean)`. Shows spinner + "Generating…" while `isLoading`.

---

## `/studio/[id]` Results Page

RSC. `params: Promise<{ id: string }>` awaited.

```ts
const upload = await prisma.studioUpload.findUnique({ where: { id } }).catch(() => null);
if (!upload || upload.vendorId !== vendor.id) redirect("/studio");
```

**Parse `generatedAssets`:**
```ts
const assets = upload.generatedAssets as Record<string, unknown>;
const garment = assets.garment as GarmentResult | undefined;
const copy = assets.copy as CopyResult | undefined;
const errorMsg = assets.error as string | undefined;
```

**Status-based rendering:**
- `PENDING` or `PROCESSING`: show spinner + "Luna AI is analysing your photos…" + `<meta http-equiv="refresh" content="3">` for auto-refresh
- `FAILED`: show `bg-coral/10` error card with `errorMsg`, "Try again" button → `/studio/new`
- `COMPLETE`: two-column results layout

**Results layout (COMPLETE):**

Left column:
- Garment tags: `<CopyPanel>` component (or inline) — maps `garment.details` + type/color/fabric as `bg-sand text-ink` pill tags
- English copy card: `copy.titleEn` (bold), `copy.descriptionEn`
- Arabic copy card (dir="rtl"): `copy.titleAr`, `copy.descriptionAr`
- "Use this copy →" link → `/products/new?studioId=${id}` (link only, pre-fill not wired)

Right column:
- Source photos: render `(upload.sourceImages as string[])` as `<img>` tags, 3-column grid
- AI-generated images: greyed placeholder, "Coming soon — image generation will be enabled in a future update."

---

## Shared Constraints

- Next.js 15: `params` is a `Promise` — always `await`
- Auth: `safeCurrentUser()` + `getVendorByUserId()` guard on every RSC page and server action
- Prisma `.catch()` fallbacks on all queries
- `generateText` (not `streamText`) for pipeline — fire-and-forget background execution is fine since we poll via page refresh
- JSON parsing from Claude: wrap in try/catch, re-throw with descriptive message if parse fails

---

## Design Tokens

- `text-ink` — headings, copy text
- `text-mist` — labels, subtitles, empty states
- `text-gold` — CTA buttons, "New Campaign" button bg-ink text-gold pill
- `bg-sand text-ink` — garment tag pills
- `bg-sage/20 text-sage` — COMPLETE badge
- `bg-gold/20 text-gold` — PROCESSING badge
- `bg-coral/20 text-coral` — FAILED badge
- `bg-sand text-mist` — PENDING badge
