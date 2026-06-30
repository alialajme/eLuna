# Phase 5: Luna Studio AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3-photo upload wizard for vendors that uses Claude vision to detect garment details and write bilingual product copy, with a polling results page.

**Architecture:** Vendors upload 3 photos via a Next.js API route (base64 data URLs), a server action creates the `StudioUpload` DB record and triggers the AI pipeline (Claude `generateText` for detection + copy), and the results RSC polls with `<meta http-equiv="refresh">` until `status === "COMPLETE"`. Image generation is stubbed. The vendor app gets `@e-luna/ai` as a new workspace dependency.

**Tech Stack:** Next.js 15 App Router, Prisma (`@e-luna/db`), Vercel AI SDK `generateText` + Anthropic claude-sonnet-4-6, Clerk auth, Tailwind CSS (Warm Oud tokens).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/ai/src/agents/studio.ts` | Modify | Add `detectGarment` + `writeCopy` exported helpers with real Claude calls |
| `packages/ai/src/index.ts` | Modify | Export `detectGarment` + `writeCopy` |
| `apps/vendor/package.json` | Modify | Add `"@e-luna/ai": "workspace:*"` dependency |
| `apps/vendor/app/api/studio/upload/route.ts` | Create | POST handler: accept 3 files, return base64 data URLs |
| `apps/vendor/app/actions/studio.ts` | Create | `createStudioUpload` + `triggerStudioPipeline` server actions |
| `apps/vendor/app/(dashboard)/studio/page.tsx` | Create | RSC: campaign list |
| `apps/vendor/app/(dashboard)/studio/new/page.tsx` | Create | "use client": 3-slot upload wizard |
| `apps/vendor/app/(dashboard)/studio/[id]/page.tsx` | Create | RSC: results with polling |

---

## Shared Context

**Working dir:** `/Users/alialajme/Projects/Luna/e-luna`

**Auth pattern** (every RSC + server action):
```ts
const user = await safeCurrentUser();
if (!user) redirect("/");  // or return { error: "Unauthorized" }
const vendor = await getVendorByUserId(user.id);
if (!vendor) redirect("/");  // or return { error: "Vendor not found" }
```

**`safeCurrentUser`** — `apps/vendor/app/lib/auth.ts`  
**`getVendorByUserId`** — `apps/vendor/app/lib/vendor.ts`  
**DB** — `import { prisma } from "@e-luna/db"`  
**AI** — `import { detectGarment, writeCopy } from "@e-luna/ai"`  
**Next.js 15** — `params` and `searchParams` are Promises, always `await`

**`StudioUpload` model:**
```
id, vendorId, sourceImages (Json = string[]), generatedAssets (Json = {}),
status (string: "PENDING"|"PROCESSING"|"COMPLETE"|"FAILED"), productId?, createdAt, updatedAt
```

**`generatedAssets` when COMPLETE:**
```ts
{
  garment: { garmentType: string; color: string; fabric: string; style: string; details: string[] };
  copy: { titleEn: string; titleAr: string; descriptionEn: string; descriptionAr: string; tags: string[] };
}
```

**`generatedAssets` when FAILED:** `{ error: string }`

---

## Task 1: AI helpers + vendor dependency

**Files:**
- Modify: `packages/ai/src/agents/studio.ts`
- Modify: `packages/ai/src/index.ts`
- Modify: `apps/vendor/package.json`

- [ ] **Step 1: Add `generateText` import and implement helpers in `packages/ai/src/agents/studio.ts`**

Read the file first, then replace its full content with:

```ts
import { streamText, tool, generateText } from "ai";
import { z } from "zod";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

// ─── Helpers for data URL → binary ───────────────────────────────────────────

function dataUrlToImage(dataUrl: string) {
  const [header, base64] = dataUrl.split(",");
  const mimeType =
    (header.match(/data:(.*?);base64/) ?? [])[1] ?? "image/jpeg";
  return {
    type: "image" as const,
    image: Buffer.from(base64, "base64"),
    mimeType,
  };
}

// ─── Standalone AI helpers (used by server actions) ──────────────────────────

export async function detectGarment(imageUrls: string[]): Promise<{
  garmentType: string;
  color: string;
  fabric: string;
  style: string;
  details: string[];
}> {
  const { text } = await generateText({
    model: anthropic(LUNA_MODEL),
    messages: [
      {
        role: "user",
        content: [
          ...imageUrls.map(dataUrlToImage),
          {
            type: "text" as const,
            text: `Analyze these abaya photos. Return JSON only (no markdown, no explanation):
{
  "garmentType": "e.g. Overhead Abaya",
  "color": "e.g. Midnight Black",
  "fabric": "e.g. Silk blend",
  "style": "e.g. Floral embroidery",
  "details": ["detail1", "detail2", "detail3"]
}`,
          },
        ],
      },
    ],
  });

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse garment detection response: ${text}`);
  }
}

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
}> {
  const { text } = await generateText({
    model: anthropic(LUNA_MODEL),
    prompt: `You are a luxury Gulf fashion copywriter for e-Luna, the Gulf's premier abaya marketplace.
Write product copy for this garment:
${JSON.stringify(garment, null, 2)}

Return JSON only (no markdown, no explanation):
{
  "titleEn": "product title in English, max 60 characters",
  "titleAr": "عنوان المنتج بالعربية، بحد أقصى 60 حرف",
  "descriptionEn": "2-3 sentence luxury marketing description in English",
  "descriptionAr": "وصف تسويقي فاخر من 2-3 جمل باللغة العربية",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`,
  });

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse copy generation response: ${text}`);
  }
}

// ─── Studio agent (streaming, used by future chat interface) ─────────────────

const STUDIO_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Studio Agent. Given 3 garment photos, you generate professional product descriptions,
AI-enhanced images, and short video concepts for marketing campaigns.
Focus on Gulf fashion aesthetics — luxury, modesty, elegance.`;

export const studioTools = {
  detect_garment: tool({
    description: "Analyze uploaded photos to detect garment type, color, fabric, and style",
    parameters: z.object({
      imageUrls: z.array(z.string()).max(3),
    }),
    execute: async ({ imageUrls }) => {
      return detectGarment(imageUrls);
    },
  }),

  generate_images: tool({
    description: "Generate professional product images from uploaded garment photos",
    parameters: z.object({
      studioUploadId: z.string(),
      style: z.enum(["editorial", "product", "lifestyle"]).default("product"),
      count: z.number().min(1).max(8).default(4),
    }),
    execute: async ({ studioUploadId, style, count }) => {
      return { imageUrls: [], jobId: "" };
    },
  }),

  write_copy: tool({
    description: "Write product title, description, and marketing copy in English and Arabic",
    parameters: z.object({
      garmentDetails: z.object({
        type: z.string(),
        color: z.string(),
        fabric: z.string(),
        style: z.string(),
      }),
      tone: z.enum(["luxury", "casual", "formal"]).default("luxury"),
    }),
    execute: async ({ garmentDetails }) => {
      return writeCopy({
        garmentType: garmentDetails.type,
        color: garmentDetails.color,
        fabric: garmentDetails.fabric,
        style: garmentDetails.style,
        details: [],
      });
    },
  }),

  generate_video: tool({
    description: "Generate a short product showcase video concept",
    parameters: z.object({
      studioUploadId: z.string(),
      durationSeconds: z.number().min(5).max(30).default(15),
    }),
    execute: async ({ studioUploadId, durationSeconds }) => {
      return { videoUrl: null, thumbnailUrl: null, jobId: "" };
    },
  }),
};

export async function runStudioAgent(
  messages: { role: "user" | "assistant"; content: string }[],
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: STUDIO_SYSTEM,
    messages,
    tools: studioTools,
    maxSteps: 8,
  });
}
```

- [ ] **Step 2: Export new helpers from `packages/ai/src/index.ts`**

Read the file first, then add `detectGarment` and `writeCopy` to the studio export line:

```ts
export { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "./config";
export { runShoppingAgent } from "./agents/shopping";
export { runSellerAgent, sellerTools } from "./agents/seller";
export { runStudioAgent, studioTools, detectGarment, writeCopy } from "./agents/studio";
export { runLogisticsAgent, logisticsTools } from "./agents/logistics";
export { runPaymentAgent, paymentTools } from "./agents/payment";
export { runPOSAgent, posTools } from "./agents/pos";
```

- [ ] **Step 3: Add `@e-luna/ai` to vendor app dependencies**

Read `apps/vendor/package.json`, then add `"@e-luna/ai": "workspace:*"` to the `dependencies` object (after `"@e-luna/db"`).

- [ ] **Step 4: Install the new dependency**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && npm install 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/packages/ai && npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add packages/ai/src/agents/studio.ts packages/ai/src/index.ts apps/vendor/package.json package-lock.json && git commit -m "feat: implement detectGarment and writeCopy AI helpers for Luna Studio"
```

---

## Task 2: Upload API route

**Files:**
- Create: `apps/vendor/app/api/studio/upload/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export async function POST(req: NextRequest) {
  const user = await currentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const urls: string[] = [];

  for (const key of ["photo0", "photo1", "photo2"] as const) {
    const file = formData.get(key) as File | null;
    if (!file) {
      return NextResponse.json({ error: `Missing ${key}` }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: `${key} exceeds 10 MB limit` },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    urls.push(`data:${mimeType};base64,${base64}`);
  }

  return NextResponse.json({ urls });
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/api/studio/upload/route.ts" && git commit -m "feat: studio photo upload API route with 10MB validation"
```

---

## Task 3: Server actions

**Files:**
- Create: `apps/vendor/app/actions/studio.ts`

- [ ] **Step 1: Create the server actions file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { detectGarment, writeCopy } from "@e-luna/ai";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

export async function createStudioUpload(
  sourceImageUrls: string[]
): Promise<{ id: string } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { error: "Vendor not found" };

  const upload = await prisma.studioUpload
    .create({
      data: {
        vendorId: vendor.id,
        sourceImages: sourceImageUrls,
        status: "PENDING",
      },
    })
    .catch((err: Error) => ({ error: err.message }));

  if ("error" in upload) return upload;
  return { id: upload.id };
}

export async function triggerStudioPipeline(
  uploadId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  const upload = await prisma.studioUpload
    .findUnique({ where: { id: uploadId } })
    .catch(() => null);

  if (!upload) return { success: false, error: "Not found" };
  if (upload.vendorId !== vendor.id)
    return { success: false, error: "Unauthorized" };

  // Mark as processing
  await prisma.studioUpload.update({
    where: { id: uploadId },
    data: { status: "PROCESSING" },
  });

  try {
    const sourceImages = upload.sourceImages as string[];

    const garment = await detectGarment(sourceImages);
    const copy = await writeCopy(garment);

    await prisma.studioUpload.update({
      where: { id: uploadId },
      data: {
        generatedAssets: { garment, copy },
        status: "COMPLETE",
      },
    });

    revalidatePath("/studio");
    revalidatePath(`/studio/${uploadId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.studioUpload.update({
      where: { id: uploadId },
      data: {
        generatedAssets: { error: message },
        status: "FAILED",
      },
    });
    revalidatePath("/studio");
    revalidatePath(`/studio/${uploadId}`);
    return { success: false, error: message };
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/actions/studio.ts" && git commit -m "feat: createStudioUpload and triggerStudioPipeline server actions"
```

---

## Task 4: Studio list page

**Files:**
- Create: `apps/vendor/app/(dashboard)/studio/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";

export const metadata: Metadata = { title: "Luna Studio — Luna Vendor" };

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-sand text-mist",
  PROCESSING: "bg-gold/20 text-gold",
  COMPLETE: "bg-sage/20 text-sage",
  FAILED: "bg-coral/20 text-coral",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETE: "Complete",
  FAILED: "Failed",
};

export default async function StudioPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const uploads = await prisma.studioUpload
    .findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">Luna Studio</h2>
          <p className="mt-1 text-body-sm text-mist">
            Upload 3 photos of your abaya — Luna AI detects the garment and
            writes your full product copy.
          </p>
        </div>
        <Link
          href="/studio/new"
          className="rounded-full bg-ink px-5 py-2 text-body-sm font-medium text-gold hover:bg-ink/90"
        >
          ✦ New Campaign
        </Link>
      </div>

      {uploads.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">
            No campaigns yet. Upload your first product photos to get started.
          </p>
          <Link
            href="/studio/new"
            className="mt-4 inline-block text-body-sm text-gold hover:underline"
          >
            ✦ New Campaign →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {uploads.map((upload) => {
            const assets = upload.generatedAssets as Record<string, unknown>;
            const copy = assets.copy as
              | { titleEn?: string }
              | undefined;
            const name =
              copy?.titleEn ?? "Untitled Campaign";
            const images = upload.sourceImages as string[];

            return (
              <div
                key={upload.id}
                className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
              >
                {/* Thumbnail strip */}
                <div className="flex gap-1.5 shrink-0">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-12 w-9 rounded bg-sand overflow-hidden"
                    >
                      {images[i] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={images[i]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="truncate text-body-sm font-medium text-ink">
                    {name}
                  </p>
                  <p className="text-body-xs text-mist">
                    {new Date(upload.createdAt).toLocaleDateString("en-AE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${STATUS_BADGE[upload.status] ?? "bg-sand text-mist"}`}
                >
                  {STATUS_LABEL[upload.status] ?? upload.status}
                </span>

                <Link
                  href={`/studio/${upload.id}`}
                  className="shrink-0 text-body-sm text-gold hover:underline"
                >
                  View →
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/studio/page.tsx" && git commit -m "feat: Luna Studio campaign list page"
```

---

## Task 5: Upload wizard

**Files:**
- Create: `apps/vendor/app/(dashboard)/studio/new/page.tsx`

- [ ] **Step 1: Create the wizard page**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createStudioUpload,
  triggerStudioPipeline,
} from "../../../actions/studio";

const SLOT_LABELS = ["Front view", "Back view", "Detail / fabric"] as const;

export default function StudioNewPage() {
  const router = useRouter();
  const [files, setFiles] = useState<(File | null)[]>([null, null, null]);
  const [previews, setPreviews] = useState<(string | null)[]>([
    null,
    null,
    null,
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileSelect(index: number, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files are accepted (JPG, PNG, WEBP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`Photo ${index + 1} exceeds 10 MB.`);
      return;
    }
    setError(null);
    const newFiles = [...files];
    newFiles[index] = file;
    setFiles(newFiles);

    const newPreviews = [...previews];
    newPreviews[index] = URL.createObjectURL(file);
    setPreviews(newPreviews);
  }

  async function handleSubmit() {
    if (!files.every(Boolean)) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Upload photos
      const formData = new FormData();
      formData.append("photo0", files[0]!);
      formData.append("photo1", files[1]!);
      formData.append("photo2", files[2]!);

      const uploadRes = await fetch("/api/studio/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Upload failed");
      }

      const { urls } = (await uploadRes.json()) as { urls: string[] };

      // 2. Create DB record
      const result = await createStudioUpload(urls);
      if ("error" in result) throw new Error(result.error);

      const { id } = result;

      // 3. Trigger pipeline (fire-and-forget — don't await)
      triggerStudioPipeline(id).catch(() => {
        // Pipeline errors are stored in generatedAssets and shown on results page
      });

      // 4. Navigate to results
      router.push(`/studio/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setIsLoading(false);
    }
  }

  const allFilled = files.every(Boolean);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="font-display text-display-md text-ink">New Campaign</h2>
        <p className="mt-1 text-body-sm text-mist">
          Upload exactly 3 photos of your abaya — front, back, and a detail
          shot.
        </p>
      </div>

      {/* Upload slots */}
      <div className="grid grid-cols-3 gap-4">
        {SLOT_LABELS.map((label, i) => (
          <label
            key={label}
            className="group relative cursor-pointer"
            aria-label={`Upload ${label}`}
          >
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) =>
                handleFileSelect(i, e.target.files?.[0] ?? null)
              }
              disabled={isLoading}
            />
            <div
              className={`relative flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-lg border-2 transition-colors ${
                previews[i]
                  ? "border-gold"
                  : "border-dashed border-sand hover:border-gold/50"
              } bg-white`}
            >
              {previews[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previews[i]!}
                  alt={label}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl text-sand group-hover:text-gold/50">
                  +
                </span>
              )}
              <p
                className={`absolute bottom-2 text-center text-body-xs font-medium ${previews[i] ? "text-gold" : "text-mist"}`}
              >
                {label}
                {previews[i] ? " ✓" : ""}
              </p>
            </div>
          </label>
        ))}
      </div>

      <p className="text-body-xs text-mist">
        Accepted: JPG, PNG, WEBP · Max 10 MB each
      </p>

      {error && (
        <p className="rounded-lg bg-coral/10 px-4 py-3 text-body-sm text-coral">
          {error}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!allFilled || isLoading}
        className="w-full rounded-full bg-ink py-3 text-body-sm font-medium text-gold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading
          ? "Generating your campaign… this takes about 15 seconds"
          : "Generate Campaign"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/studio/new/page.tsx" && git commit -m "feat: Studio upload wizard with 3-slot photo input"
```

---

## Task 6: Results page

**Files:**
- Create: `apps/vendor/app/(dashboard)/studio/[id]/page.tsx`

- [ ] **Step 1: Create the results page**

```tsx
import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";

type Props = { params: Promise<{ id: string }> };

type GarmentResult = {
  garmentType: string;
  color: string;
  fabric: string;
  style: string;
  details: string[];
};

type CopyResult = {
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  tags: string[];
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Campaign ${id.slice(-8).toUpperCase()} — Luna Studio` };
}

export default async function StudioResultPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const upload = await prisma.studioUpload
    .findUnique({ where: { id } })
    .catch(() => null);

  if (!upload || upload.vendorId !== vendor.id) redirect("/studio");

  const assets = upload.generatedAssets as Record<string, unknown>;
  const garment = assets.garment as GarmentResult | undefined;
  const copy = assets.copy as CopyResult | undefined;
  const errorMsg = assets.error as string | undefined;
  const sourceImages = upload.sourceImages as string[];

  // Polling: auto-refresh while still processing
  const isPolling =
    upload.status === "PENDING" || upload.status === "PROCESSING";

  return (
    <div className="max-w-3xl space-y-6">
      {isPolling && (
        // eslint-disable-next-line @next/next/no-head-element
        <meta httpEquiv="refresh" content="3" />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">
            {copy?.titleEn ?? "Campaign"}
          </h2>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-body-xs font-medium ${
              upload.status === "COMPLETE"
                ? "bg-sage/20 text-sage"
                : upload.status === "FAILED"
                  ? "bg-coral/20 text-coral"
                  : "bg-gold/20 text-gold"
            }`}
          >
            {upload.status === "COMPLETE"
              ? "Complete"
              : upload.status === "FAILED"
                ? "Failed"
                : "Processing…"}
          </span>
        </div>
        {copy && (
          <Link
            href={`/products/new?studioId=${id}`}
            className="rounded-full bg-ink px-5 py-2 text-body-sm font-medium text-gold hover:bg-ink/90"
          >
            Use this copy →
          </Link>
        )}
      </div>

      {/* Processing state */}
      {isPolling && (
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sand border-t-gold" />
          <p className="text-body-sm text-mist">
            Luna AI is analysing your photos…
          </p>
        </div>
      )}

      {/* Failed state */}
      {upload.status === "FAILED" && (
        <div className="rounded-lg bg-coral/10 p-5">
          <p className="mb-3 text-body-sm font-medium text-coral">
            Generation failed
          </p>
          <p className="mb-4 text-body-sm text-mist">
            {errorMsg ?? "An unexpected error occurred."}
          </p>
          <Link
            href="/studio/new"
            className="text-body-sm text-gold hover:underline"
          >
            ← Try again
          </Link>
        </div>
      )}

      {/* Complete state */}
      {upload.status === "COMPLETE" && garment && copy && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_240px]">
          {/* Left: copy panel */}
          <div className="space-y-4">
            {/* Garment tags */}
            <div className="rounded-lg border border-sand bg-white p-4">
              <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
                Detected garment
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  garment.garmentType,
                  garment.color,
                  garment.fabric,
                  garment.style,
                  ...garment.details,
                ]
                  .filter(Boolean)
                  .map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-sand px-3 py-1 text-body-xs text-ink"
                    >
                      {tag}
                    </span>
                  ))}
              </div>
            </div>

            {/* English copy */}
            <div className="rounded-lg border border-sand bg-white p-4">
              <p className="mb-2 text-body-xs font-medium uppercase tracking-wide text-mist">
                English copy
              </p>
              <p className="mb-2 font-display text-body-md font-semibold text-ink">
                {copy.titleEn}
              </p>
              <p className="text-body-sm leading-relaxed text-mist">
                {copy.descriptionEn}
              </p>
              {copy.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {copy.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-sand px-2 py-0.5 text-body-xs text-mist"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Arabic copy */}
            <div className="rounded-lg border border-sand bg-white p-4" dir="rtl">
              <p
                className="mb-2 text-body-xs font-medium uppercase tracking-wide text-mist"
                dir="ltr"
              >
                Arabic copy
              </p>
              <p className="mb-2 font-display text-body-md font-semibold text-ink">
                {copy.titleAr}
              </p>
              <p className="text-body-sm leading-relaxed text-mist">
                {copy.descriptionAr}
              </p>
            </div>
          </div>

          {/* Right: photos + image placeholder */}
          <div className="space-y-4">
            {/* Source photos */}
            <div className="rounded-lg border border-sand bg-white p-4">
              <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
                Source photos
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {sourceImages.slice(0, 3).map((src, i) => (
                  <div
                    key={i}
                    className="aspect-[3/4] overflow-hidden rounded bg-sand"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Source ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Image generation placeholder */}
            <div className="rounded-lg border border-sand bg-white p-4">
              <p className="mb-1 text-body-xs font-medium uppercase tracking-wide text-mist">
                AI-generated images
              </p>
              <p className="mb-3 text-body-xs text-mist">
                Coming soon — image generation will be enabled in a future
                update.
              </p>
              <div className="grid grid-cols-2 gap-1.5 opacity-30">
                <div className="aspect-[3/4] rounded bg-gold" />
                <div className="aspect-[3/4] rounded bg-gold" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/studio/[id]/page.tsx" && git commit -m "feat: Studio results page with garment tags, bilingual copy, and polling"
```

---

## Task 7: Final TypeScript check + git log

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check — vendor app**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1
```

Expected (only this):
```
tailwind.config.ts(1,29): error TS2307: Cannot find module 'tailwindcss' or its corresponding type declarations.
```

Any other error must be fixed before proceeding.

- [ ] **Step 2: Full TypeScript check — AI package**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/packages/ai && npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 3: Confirm git log**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git log --oneline -7
```

Expected commits (newest first):
- feat: Studio results page with garment tags, bilingual copy, and polling
- feat: Studio upload wizard with 3-slot photo input
- feat: Luna Studio campaign list page
- feat: createStudioUpload and triggerStudioPipeline server actions
- feat: studio photo upload API route with 10MB validation
- feat: implement detectGarment and writeCopy AI helpers for Luna Studio
- (previous Phase 4d commit)

Report the actual SHAs.
