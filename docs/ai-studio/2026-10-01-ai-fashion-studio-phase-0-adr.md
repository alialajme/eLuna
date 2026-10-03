# AI Fashion Studio — Phase 0 Architecture ADR

**Status:** Proposed (Phase 0 — design only; no production code, no schema migration)
**Date:** 2026-10-01
**Author:** Architecture (Claude Opus 4.8)
**Scope:** Productionize AYVANA's stubbed Phase 5 Studio into a monetized, admin-monitored, fidelity-gated commercial-content generation system ("AI Fashion Studio").
**Deliverable:** This document only. No source files, no `prisma db push`, no migrations were run.

> **Reading note.** This ADR is the §35 Phase 0 deliverable. It covers all 18 required items in order (codebase inspection → provider research → cost model → architecture → DB schema → APIs → jobs → security → finance → implementation plan → files → assumptions). Code snippets are illustrative design sketches, **not** committed code. Everything marked **ASSUMPTION** in §18 needs the user's sign-off before Phase 1.

---

## 0. Executive summary

AYVANA already ships **Phase 5 "AYVANA Studio AI"** in the vendor app: a 3-photo upload wizard that calls Claude vision (`detectGarment`) + Claude text (`writeCopy`) through a fire-and-forget server action, polling results via `<meta http-equiv="refresh">`. **Image and video generation are explicitly stubbed** (`generate_images` → `{imageUrls:[]}`, `generate_video` → `{videoUrl:null}`) and were deferred as "Phase 5b". AI Fashion Studio **is Phase 5b made real + monetized + admin-monitored**.

**Headline decisions (full rationale in the sections below):**

1. **Build the generation engine as a new shared package `@ayvana/fashion`** (gateway-pattern provider abstraction, exactly like `@ayvana/payments`/`@ayvana/courier`/`@ayvana/einvoice`), and **evolve the existing vendor Studio surface in place** — keep the `/studio` routes and the `StudioUpload` row as a thin "legacy campaign" record, but route all real generation through the new session/job model. **Extend-the-surface, replace-the-engine.** (ADR §1, §18-A).
2. **`FashionGenerationProvider` mirrors the repo's credential-gated gateway**: interface → `SimulatedFashionProvider` (placeholder output, no keys, builds + runs offline) → config-gated real adapters (per operation) → `factory` that never throws → `hasX()` config. The feature **compiles and runs keyless** on day one.
3. **Recommended initial provider combination (different provider per operation):**
   - **Try-on / on-model garment preservation:** **FASHN v1.6 / Try-On Max** (fashion-native, 864×1296→4K, catalog-grade garment-text/pattern fidelity, commercial-licensed).
   - **Multi-view + model-identity consistency:** **Google Gemini "Nano Banana" (2.5 Flash Image / 3-pro-image)** or **Black Forest Labs FLUX.2** (8–10 reference images, strong cross-image identity) as the consistency engine that locks the model face/body across the 4 angles.
   - **Image-to-video 360° turntable:** **Google Veo 3.1 Reference-to-Video** (up to 3 reference frames → conditioned, not text-only; strong fabric/color hold) with **Kling 3.0** as the cost-optimized fallback.
   - **Fidelity scoring:** **Claude vision** (already in `@ayvana/ai`) as the structured attribute-comparison judge, complemented by deterministic CV metrics (color-histogram / embedding similarity) in-house.
   - **Moderation / safety:** **AWS Rekognition** or **Hive** image moderation (~$0.001–0.003/image).
   - **Provenance:** embed **C2PA Content Credentials** on every published asset (EU AI Act, effective Aug 2026, requires AI-content labelling).
4. **One successful AI Shoot (4 images + 1 retry budget + one 6s turntable + QA + storage) costs ≈ USD $0.90–$1.60 variable** (≈ AED 3.3–5.9). Against the TRY plan (AED 49 / 2 shoots = AED 24.5/shoot) that is **~16–24% cost ratio**; at every higher tier the ratio is far below the ≤35% target and margin clears 60–70%+. (See §9.)
5. **The async job queue is net-new.** The repo has the pieces — a **transactional outbox** (`OutboxEvent` + `appendOutboxEvent`, ADR-0005) with a designed `FOR UPDATE SKIP LOCKED` worker — but **no running worker process exists today**. MVP path = DB-backed `GenerationJob` table + an outbox-style claim worker (Node, runs as an AKS `Deployment`/cron). Scale path = Azure Service Bus / KEDA-scaled workers on AKS. (See §13.)
6. **Object storage is net-new.** Cloudinary is referenced in docs but **not configured**; Phase 5 stores images as **base64 data URLs in a JSON column** — this will not scale to 4 images + video per shoot. Recommend **Azure Blob Storage** (UAE North, co-located with the AKS/Postgres target) with signed upload + signed read URLs + CDN + lifecycle retention, behind a credential-gated storage gateway with a local-disk/`data:`-URL Simulated fallback. (See §8, §18-C.)

---

## 1. Codebase inspection — what exists today

Inspected the monorepo at `/Users/alialajme/Projects/Luna/e-luna`. Turborepo; 4 Next.js 15 (App Router, async `params`) apps — `customer` (:3000), `vendor` (:3001, sell.ayvana.ae), `admin` (:3002, ops.ayvana.ae), `supplier` (:3003) — plus packages `@ayvana/{ui,db,ai,auth,config,payments,courier,einvoice,observability}`. TypeScript, Tailwind (ink `#1a0a00` + sand/gold palette, Jost/Inter). Prisma + PostgreSQL in `packages/db`. Clerk auth (MFA, per-app middleware). Vercel AI SDK + Claude (`claude-sonnet-4-6`) in `@ayvana/ai`. Stripe (+ Tabby/Tamara/NeoPay scaffolds) via `@ayvana/payments`. Deploy: Vercel now → **Azure AKS UAE North** (`docker/`, `infra/helm`, `infra/bicep`; containers/HPA/Key Vault/workload-identity).

### 1.1 The existing Phase 5 Studio (the thing we are productionizing)

| Element | Path | What it does | Limitation |
|---|---|---|---|
| List | `apps/vendor/app/(dashboard)/studio/page.tsx` | RSC campaign list for the vendor, status badges | — |
| Wizard | `apps/vendor/app/(dashboard)/studio/new/page.tsx` | `"use client"` 3-slot upload (Front/Back/Detail), 10 MB client cap | Fixed 3 slots; no QC |
| Results | `apps/vendor/app/(dashboard)/studio/[id]/page.tsx` | RSC results; **polls via `<meta http-equiv="refresh" content="3">`**; renders garment tags + EN/AR copy; "Coming soon" image placeholder | Meta-refresh polling; image/video stubbed |
| Actions | `apps/vendor/app/actions/studio.ts` | `createStudioUpload(urls)` → PENDING row; `triggerStudioPipeline(id)` **fire-and-forget**, PENDING→PROCESSING→COMPLETE/FAILED; ownership-checked | Runs inside a server action (Vercel 10s timeout risk documented); no retries/DLQ |
| Upload API | `apps/vendor/app/api/studio/upload/route.ts` | `multipart/form-data` `photo0..2`; returns **base64 `data:` URLs**; 10 MB cap; `ACTIVE` vendor gate | base64 in DB JSON; no object storage |
| AI | `packages/ai/src/agents/studio.ts` | `detectGarment(urls)`, `writeCopy(garment)` (real Claude, `generateText`); `studioTools` with **STUBBED** `generate_images` → `{imageUrls:[],jobId:""}` and `generate_video` → `{videoUrl:null,...}` | Image/video generation not implemented |
| Model | `packages/db/prisma/schema.prisma` → `model StudioUpload` | `{ id, vendorId, sourceImages Json, generatedAssets Json, status String, productId?, timestamps }`, `@@index([vendorId])` | Status is a free `String`; both media + results are untyped JSON blobs |
| AI config | `packages/ai/src/config.ts` | `createAnthropic`, `AYVANA_MODEL="claude-sonnet-4-6"`; **throws at import if `ANTHROPIC_API_KEY` unset** | Hard-fail import (acceptable — mirror it) |

### 1.2 The gateway pattern (the reuse backbone)

Four production gateways all follow the **identical** convention — **interface → `Simulated*` (works offline, no keys) → config-gated real adapter(s) (`TODO(operator)` scaffolds, never fake success) → `factory` that never throws → `hasX()` config → explicit barrel (not `export *`)**, with a **discriminated-union return** (never throws to the caller):

- `packages/payments/` — `PaymentGateway.createPayment()` → `{status:"captured"}|{status:"requires_action";clientSecret}|{status:"failed";error}`; `getGateway(method)`; `hasStripe()`, `neopayAvailable() = hasNeopay() || NODE_ENV!=="production"`. **Dual gate:** UI + server both check `providerAvailable()` so an unconfigured provider's Simulated `captured` cannot mint a paid order in prod (ADR-0002).
- `packages/courier/` — `CourierGateway.createShipment()` → `{status:"created";trackingNumber;externalRef;labelUrl?}|{status:"manual"}|{status:"failed"}`; neutral `CourierDeliveryStatus = "in_transit"|"delivered"|"exception"`; `getCourierGateway(courierId)`.
- `packages/einvoice/` — `EInvoiceGateway.issue()` → `{status:"issued";externalRef}|{status:"failed"}`; `SimulatedEInvoice` is **fully offline-complete** (the printable page IS the compliant doc); `FtaEInvoice` is the config-gated network scaffold.
- `apps/supplier/app/lib/trade-license/` — app-local `TradeLicenseVerifier.verify()` → `{status:"verified"}|{status:"pending"}|{status:"rejected"}`.

**This is the exact template for `FashionGenerationProvider`.**

### 1.3 Financial discipline (the ledger/billing backbone)

- `packages/db/src/supplier-payouts.ts` — `createSupplierPayout` uses **`SELECT id FROM "Supplier" WHERE id=${id} FOR UPDATE`** inside `prisma.$transaction`, recomputes `available` inside the lock, returns `{ok:true,...}|{ok:false,reason:"NO_BALANCE"}`. `computeSupplierBalance` uses **`Decimal` only** (`money().plus().minus()`, `round2`, floor at 0). **This is the exact pattern for atomic credit reserve.**
- `packages/db/src/ledger.ts` — append-only `appendLedgerEntry(tx, {entryType, amount(signed), ...})`; `LedgerEntryType` enum exists. `docs/adr/0003-immutable-financial-ledger.md`: rows never UPDATE/DELETE; corrections are reversing entries; FKs `Restrict`. **Model `CreditTransaction` on this.**
- `packages/db/src/settings.ts` — config-in-DB: a typed `SETTINGS = { key: {label,type,default} } as const` registry + `getSetting<K>` (typed, coerced, **`.catch`→default fallback**) + validated `setSetting`. **Plan prices/limits live here-style, admin-editable, never hard-coded.**
- Billing / webhooks — `packages/payments/src/reconcile.ts` `applyPaymentResult` is **idempotent** (`if(!order||status!=="PENDING")return`); Stripe webhook (`apps/customer/app/api/webhooks/stripe/route.ts`) verifies signature via `constructEvent(rawBody,sig,secret)` and returns 200 even for ignored events. Checkout is **order-first** (reserve stock + PENDING order + PENDING tx → gateway → webhook flips to CONFIRMED). **Subscriptions + credit-pack purchases reuse this whole flow.**
- `packages/db/src/audit.ts` — `writeAuditLog(tx, entry)` (redacts secrets) + `auditSafe`. Admin payout action posts ledger + audit **atomically in the same `$transaction`**.

### 1.4 Admin dashboard + auth (reuse as-is)

- `packages/auth/src/server.ts` — `getAuthUser()` → `{userId, role, vendorId, supplierId}`; `safeCurrentUser()`. Vendor actions resolve `vendorId` **server-side** (`safeCurrentUser` → `getVendorByUserId` → `ACTIVE`), never a client param.
- Admin three-layer gate (defense-in-depth): `apps/admin/middleware.ts` + `apps/admin/app/(dashboard)/layout.tsx` role gate + per-action `getAuthUser` ADMIN check.
- Admin analytics (`apps/admin/app/(dashboard)/analytics/*`) — getAuthUser-gated RSC + **hand-rolled inline-SVG `LineChart`/`BarChart` (NO chart lib — firm project decision)** + `PeriodToggle` (7/30/90d, `text-sage` active). Degenerate-input guarded; `noUncheckedIndexedAccess` requires `arr[i]=(arr[i]??0)+x`.

### 1.5 Async / jobs (partially exists — the key nuance)

- **`OutboxEvent` model exists** (`packages/db/prisma/schema.prisma`) + `appendOutboxEvent(tx,…)` + ADR-0005 designs a `processOutbox` worker that claims due rows with **`UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING …`**, visibility timeout, idempotent handler, backoff → `maxAttempts` → `FAILED`.
- **But ADR-0005 explicitly states: "A running dispatcher process/cron and real consumers are a documented follow-up."** There is **no running worker** in the repo today — only the fire-and-forget studio server action. So the generation pipeline's worker is **net-new**, but it should be built as a **first real consumer of the already-designed outbox**, not a parallel invention.

### 1.6 Storage (net-new)

- Cloudinary is named in `CLAUDE.md`/decisions but **not configured anywhere in code** (no SDK import, no env wiring). `Product.aiImages` is `Json`; Studio stores base64 `data:` URLs. There is **no object storage, no signed URLs, no CDN** in code. **Net-new.**

---

## 2. Current architecture (as-is, relevant slice)

```
Vendor browser
  └─ /studio/new  (client) ──POST multipart──▶ /api/studio/upload ──▶ base64 data: URLs
        └─ createStudioUpload(urls)  ──▶  StudioUpload row (PENDING, sourceImages=Json)
        └─ triggerStudioPipeline(id) ──(fire-and-forget, no await)──▶
                 Claude detectGarment() ─▶ Claude writeCopy() ─▶ generatedAssets=Json, status=COMPLETE
  └─ /studio/[id] (RSC) ──<meta refresh 3s>──▶ re-render until COMPLETE/FAILED
```

Everything runs **in-request** (server action), stores **everything in Postgres JSON**, and **generates no pixels**. It is a correct, minimal vertical slice — but it has no queue, no storage, no fidelity gate, no billing, no provider abstraction for pixels/video, and no admin visibility.

---

## 3. What is reusable (lift directly)

| Capability | Reuse | Where |
|---|---|---|
| Provider abstraction shape | **Copy the gateway pattern verbatim** | `packages/payments`, `packages/courier`, `packages/einvoice` |
| Claude vision + text | `detectGarment`/`writeCopy` + `anthropic`/`AYVANA_MODEL` | `packages/ai` |
| Atomic money + row lock | `FOR UPDATE` + `$transaction` + `Decimal` | `packages/db/src/supplier-payouts.ts` |
| Append-only ledger | `appendLedgerEntry`, `LedgerEntryType`, Restrict FKs | `packages/db/src/ledger.ts`, ADR-0003 |
| Config-in-DB | typed `SETTINGS` registry + `getSetting`/`setSetting` | `packages/db/src/settings.ts` |
| Subscriptions + packs billing | order-first + idempotent `applyPaymentResult` + webhook sig verify | `packages/payments`, `apps/customer/app/api/webhooks/stripe` |
| UAE 5% VAT invoices | `@ayvana/einvoice` gateway + `TaxInvoiceDocument` (`@ayvana/ui`) | `packages/einvoice`, `packages/ui` |
| Admin dashboard | getAuthUser-gated RSC + inline-SVG `LineChart`/`BarChart` + `PeriodToggle` | `apps/admin/app/(dashboard)/analytics/*` |
| Auth/RBAC | `getAuthUser`, `safeCurrentUser`, server-resolved `vendorId`, 3-layer admin gate | `packages/auth`, all apps |
| Async primitive | `OutboxEvent` + `appendOutboxEvent` + `FOR UPDATE SKIP LOCKED` claim design | ADR-0005 |
| Observability | `@ayvana/observability` logger + correlation IDs (used in webhook route) | `packages/observability` |
| Deploy | AKS Deployment/HPA/Key Vault/workload-identity, `output:"standalone"` containers | `docker/`, `infra/helm`, `infra/bicep` |

---

## 4. What is net-new

1. **`@ayvana/fashion`** — the `FashionGenerationProvider` gateway package (per-operation adapters: try-on, multi-view, image-to-video, fidelity, moderation) + `SimulatedFashionProvider`.
2. **`@ayvana/storage`** — object-storage gateway (Azure Blob adapter + Simulated local/`data:` fallback; signed upload + signed read + retention).
3. **Async job pipeline** — a **running worker** (first real consumer of the outbox) with the full state machine, retries, DLQ, idempotency.
4. **Credit wallet + ledger** — `CreditWallet` + append-only `CreditTransaction` (reserve→consume/release).
5. **Subscriptions + credit packs** — `SubscriptionPlan`, `SellerSubscription`, `CreditPackage` (prices config-in-DB), Stripe subscription + one-off purchase flows.
6. **Garment Intelligence** — `GarmentAsset`/`GarmentAnalysis` with segmentation masks, detail crops, visual embeddings (not text-only).
7. **AI Model Library** — `AIModelProfile` (reusable identity).
8. **GenerationSession** — the consistency anchor tying garment embeddings + model identity + seed/reference + lighting + env + camera + provider + params.
9. **Fidelity Engine** — generated-vs-source scoring + configurable thresholds + fidelity-gated publishing.
10. **Cost/margin engine** — real per-generation cost capture → contribution/margin reporting.
11. **Cost router** — quality × complexity × plan × resolution × availability × historical-fidelity × cost → provider choice.
12. **Admin AI-Studio dashboard** — generation volume, fidelity pass rate, cost/margin, provider mix, queue health.
13. **AI safety + provenance** — moderation gate + C2PA Content Credentials + model-likeness/consent policy.
14. **Versioned public API surface** `/ai-studio/*` + `/admin/ai-studio/*`.

---

## 5. Architectural & security risks (and mitigations)

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Paying for platform failures.** A provider/infra error must never consume a seller's credit. | Credits `RESERVED` on start → `CONSUMED` only on a published/accepted result; infra failure → `RELEASED`. Distinguish provider-business-failure (still may charge per policy) vs platform-failure (always release). Idempotent, row-locked (§15). |
| R2 | **Simulated provider fakes output in prod.** Keyless fallback could "succeed" with placeholder pixels and get published/charged. | `fashionAvailable(op) = hasProvider(op) || NODE_ENV!=="production"`, checked **server-side** before enqueue AND before publish (ADR-0002 dual-gate). In prod with no keys → feature disabled, not fake-captured. Simulated assets are watermarked `SIMULATED` and are never publishable in prod. |
| R3 | **Garment infidelity → wrong product ships.** Model hallucinates color/embroidery/length → commerce harm + returns. | Fidelity Engine is a **hard gate before publish**; below threshold → auto-retry per policy → manual review. Never publish below the commerce-safety threshold even to save cost (§10, §18-engineering-rules). |
| R4 | **Long-running GPU/video jobs blow the request timeout.** Vercel server actions time out ~10s; a shoot takes minutes. | Async worker + job table; the API only enqueues. Must NOT run generation in a server action (the current Phase 5 anti-pattern). |
| R5 | **Cross-tenant leakage.** A seller sees/pays-for another seller's assets/wallet. | `sellerId` server-resolved (never a client param); every query scoped; signed asset URLs are per-asset, short-TTL, tenant-scoped; admin reads via getAuthUser ADMIN gate. |
| R6 | **PII / likeness of AI models + uploaded brand IP.** Model faces, logos, and garment IP need consent + retention rules. | AI models are **synthetic** profiles (no real-person likeness) with a documented consent/usage policy; uploads are the seller's own IP (ToS); temp uploads auto-expire; moderation gate blocks disallowed content; C2PA credential marks AI origin (EU AI Act Aug 2026). |
| R7 | **Provider lock-in / outage.** One provider down or price-spikes. | Provider-agnostic gateway + cost router with availability input + per-operation fallback (e.g., Veo→Kling). Historical fidelity per provider recorded. |
| R8 | **Webhook spoofing / double-apply on billing.** | Signature-verified webhooks + idempotent `applyPaymentResult`-style reconcile; order-first (§15). |
| R9 | **Cost blowout from unbounded retries.** | Bounded regenerations per plan; retry economics tracked; DLQ after `maxAttempts` → manual review (§13, §19). |
| R10 | **Storage of large media in Postgres (today's base64).** | Object storage with signed URLs; DB stores only keys/metadata (§8). |
| R11 | **Prompt/image injection via uploaded photos** (adversarial text in image). | Treat vision output as untrusted; structured JSON parse with validation; no tool is driven by free-form model text that moves money or publishes without the deterministic fidelity gate. |

---

## 6. Provider research (2026) — virtual try-on, fidelity, multi-view/identity, image-to-video, turntable

> Prices are vendor list prices captured October 2026; treat as planning estimates, re-confirm at integration. All costs USD unless noted. Aggregators (fal, Replicate) expose many of these under one SDK with pay-per-use billing, which suits the per-operation gateway.

### 6.1 Virtual try-on / on-model garment preservation

| Provider / model | Resolution | Garment fidelity | Approx price | Commercial licence | Notes |
|---|---|---|---|---|---|
| **FASHN v1.6** | 864×1296 | Renders garment **text + patterns**, continuous alignment; 3 quality modes; auto category detect | **$0.075 / image** (≈$0.04 at volume) | Yes (commercial API) | Fashion-native; catalog-grade; the strongest dedicated try-on. [fashn.ai](https://fashn.ai/products/api), [docs](https://docs.fashn.ai/api-reference/tryon-v1-6) |
| **FASHN Try-On Max** | up to **4K** | "Publish-ready" fidelity; clothing + shoes + accessories | ~**4× credits** (~$0.30/img) | Yes | Premium tier for BRAND/ENTERPRISE plans. [changelog](https://fashn.ai/changelog/api-try-on-max-endpoint-now-available) |
| **FLUX Virtual Try-On Pro** (via fal) | ≤2 MP person | Faithful color/cut; natural-language styling (tuck, roll sleeves) | **$0.0375 first MP**, then lower | Yes | Good for styling prompts; billed per megapixel. [fal](https://fal.ai/learn/tools/best-virtual-try-on-apis-2026) |
| **Kling Kolors v1.5** (via fal) | n/s | Convincing fabric; holds pose/skin-tone/body | **$0.07 / image** | Yes | Solid alt; good body-shape hold. |
| **DRESSX AI Suite** | n/s | Enterprise B2B try-on; luxury brand deployments (Victoria Beckham, Depop) | Enterprise/custom | Yes | ENTERPRISE-tier partner option, not pay-per-use. [DRESSX](https://en.wikipedia.org/wiki/DRESSX) |

**Pick: FASHN v1.6 as the default try-on engine; Try-On Max for premium plans/high resolution; FLUX/Kling as cost-router fallbacks.** Abayas are a flowing, full-length, often-dark garment with embroidery/pattern detail — a **fashion-native** try-on model (FASHN) preserves fabric drape and embroidery better than a general image model.

### 6.2 Multi-view + model-identity consistency (the "same model, 4 angles" problem)

| Provider / model | Reference images | Identity consistency | Approx price | Notes |
|---|---|---|---|---|
| **Google "Nano Banana" — Gemini 2.5 Flash Image** | multi-image | Strong edit/identity hold; C2PA-signed output | **$0.039 / image** (batch $0.0195) | Released Oct 2025; retiring Oct 2, 2026 — migrate to the 3-series. [ai.google.dev pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| **Nano Banana Pro — gemini-3-pro-image** | multi-image | Higher-fidelity, resolution-aware | **$0.13–$0.24 / image** | Premium identity engine. |
| **Nano Banana 2 — gemini-3.1-flash-image** | multi-image | Fast, consistent | **$0.045–$0.15 / image** | Current fast tier. |
| **Black Forest Labs FLUX.2** | **up to 8 (API) / 10 (playground)** | Holds character identity across **hundreds** of images, lighting, pose; explicitly "fashion/editorial character sets" | per-MP (via fal/BFL) | Best-in-class multi-reference for a recurring brand model. [linocut](https://linocut.ai/blogs/multi-reference-ai-image-models/) |
| **FLUX Kontext** | reference-image system | Multi-turn facial/clothing/pose consistency | per-MP | Alternative consistency engine. [flixly](https://www.flixly.ai/blog/flux-kontext-review-character-consistency-2026) |
| **ByteDance Seedream 4.0/5.0** | array of refs | "Strongest at multi-reference"; holds identity across refs | per-image (via fal/infer) | Strong alt. [tryinfer](https://tryinfer.com/models/seedream-4-0) |

**Pick: FLUX.2 (or Nano Banana Pro) as the identity/multi-view engine** that locks a single `AIModelProfile` identity across the 4 angles, seeded from the try-on composite. The GenerationSession passes the same model reference + seed to every angle so only camera/pose vary.

### 6.3 Image-to-video / controlled 360° turntable (conditioned on frames, not text)

| Provider / model | Conditioning | Price | Notes |
|---|---|---|---|
| **Google Veo 3.1 Reference-to-Video** | **up to 3 reference images/frames** → coherent clip; keeps "same outfit from different angles, fabric texture + color accuracy" | **$0.03/s** (3.1 Lite, 720p video-only), $0.08/s (Fast), $0.40/s (Standard+audio) | **Frame-conditioned — exactly what the turntable needs.** [developers.googleblog](https://developers.googleblog.com/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/), [replicate](https://replicate.com/google/veo-3.1) |
| **Kling 3.0** | image-to-video, subject consistency, multi-shot | ~**$0.084–$0.168/s** | Cost-optimized fallback; strong subject consistency. [cometapi](https://www.cometapi.com/ai-video-api-pricing/) |
| **Runway Gen-4 Turbo / Gen-4.5** | image-to-video | **$0.05/s** (Turbo) / $0.12/s (4.5) | Alternative; cheapest Runway. [unifically](https://unifically.com/blogs/runway-gen-4) |

**Pick: Veo 3.1 (Lite/Fast, video-only — no audio needed) conditioned on the 4 generated multi-view frames** to drive the turntable (front→3/4→side→back→opposite→front). Kling 3.0 as the cost-router fallback. We feed the actual generated frames as reference, satisfying the "video conditioned on frames, not text-only" rule.

### 6.4 Fidelity scoring

- **Claude vision** (already in `@ayvana/ai`, `claude-sonnet-4-6`) as the structured attribute comparator: source-vs-generated on color/pattern/embroidery+location/silhouette/length/sleeves/buttons/closures/logo/fabric/structure → JSON scores. Marginal cost ~a few cents/comparison.
- Complement with **deterministic CV**: color-histogram distance, perceptual hash, and **visual-embedding cosine similarity** (same embedding model used for Garment Intelligence) for model-consistency and image-quality signals. In-house, near-zero marginal cost.

### 6.5 Moderation + provenance

- **Moderation:** AWS Rekognition (~$0.001/image, first 1M/mo) or Hive ($0.001–0.005/image) — both ~cents. [AWS](https://wring.co/blog/aws-rekognition-pricing-guide), [Hive](https://thehive.ai/pricing).
- **Provenance:** embed **C2PA Content Credentials** on every published image/video (OpenAI, Adobe Firefly, Google Imagen already embed them; EU AI Act transparency labelling effective **Aug 2026**). [contentauthenticity.org](https://contentauthenticity.org/blog/the-state-of-content-authenticity-in-2026), [Wikipedia: Content Credentials](https://en.wikipedia.org/wiki/Content_Credentials).

### 6.6 Recommended initial combination

| Operation | Primary | Fallback (cost router) |
|---|---|---|
| Try-on / garment preservation | **FASHN v1.6** (Try-On Max for premium) | FLUX Virtual Try-On Pro / Kling Kolors |
| Multi-view + identity | **FLUX.2** (or Nano Banana Pro for premium) | Nano Banana 2 / Seedream |
| Image-to-video turntable | **Veo 3.1 (Lite/Fast)** | Kling 3.0 / Runway Gen-4 Turbo |
| Fidelity | **Claude vision + in-house CV** | — |
| Moderation | **AWS Rekognition** | Hive |
| Provenance | **C2PA Content Credentials** | — |

All reached through the per-operation gateway, most via **fal / Replicate aggregators** (single SDK, pay-per-use) to minimize integration surface and keep the cost router simple.

---

## 7. (reserved — merged into §6)

---

## 8. Storage design

**Recommendation: Azure Blob Storage (UAE North)** behind a credential-gated `@ayvana/storage` gateway, co-located with the AKS + Postgres Flexible Server target (data residency + egress cost). Rationale over S3: the deploy target is Azure AKS with Key Vault + workload-identity already wired (`infra/bicep`), so Blob + a user-assigned managed identity needs no new secret plumbing. Rationale over Cloudinary: Cloudinary is unconfigured, adds a 3rd-party data-residency question, and we need signed-upload + retention control for raw seller photos anyway.

```
interface StorageGateway {
  signedUpload(p: { key; contentType; maxBytes }): Promise<{ url; key; headers } | { error }>;
  signedRead(p: { key; ttlSeconds }): Promise<{ url } | { error }>;
  delete(key): Promise<void>;
}
```

- **Simulated fallback (no keys):** writes to a local temp dir / returns `data:` URLs so the feature builds + runs offline (mirrors Phase 5 base64 so dev is unchanged). `hasBlobStorage() = !!AZURE_STORAGE_ACCOUNT && !!AZURE_STORAGE_CONTAINER` (credential via workload identity, not a key, in prod).
- **Buckets/containers:** `uploads-temp` (raw seller photos, **lifecycle: auto-delete 30d** after shoot completion, configurable), `assets` (published images/video, long-lived), `masks-crops` (Garment Intelligence derivatives).
- **CDN:** Azure Front Door / CDN in front of `assets`; signed, short-TTL read URLs for in-app preview; public CDN URL only after publish.
- **DB stores keys, never bytes.** `GarmentImage.storageKey`, `GeneratedAsset.storageKey`. The `StudioUpload.sourceImages` base64 path is **frozen** (legacy) and migrated opportunistically.

---

## 9. Cost model — one successful AI Shoot

**Definition of an "AI Shoot" (the seller-facing unit):** 1 garment → upload QC → Garment Intelligence → GenerationSession → **4 images** (front, back, 3/4-front, 3/4-back) → **1 turntable video (5–10s)** → fidelity scoring → publish. GPU/token credits are **hidden** from sellers.

**Expected provider cost (primary combination, with a realistic retry budget):**

| Line item | Calls | Unit | Expected cost (USD) |
|---|---|---|---|
| Garment Intelligence (Claude vision, segmentation/attributes) | 1 | ~$0.02 | $0.02 |
| Try-on composite (FASHN v1.6) | 1 base | $0.075 | $0.075 |
| 4 multi-view images (FLUX.2 / identity engine) | 4 | ~$0.05 | $0.20 |
| Image retries (expected ≈0.8 extra of the 4, fidelity-driven) | ~1 | ~$0.05 | $0.05 |
| Turntable video 6s (Veo 3.1 Fast, 720p, video-only @ $0.08/s) | 1 | $0.48 | $0.48 |
| Video retry (expected ≈0.3 of one clip) | 0.3 | $0.48 | $0.14 |
| Fidelity scoring (Claude vision × ~5 assets + CV in-house) | ~5 | ~$0.015 | $0.08 |
| Moderation (5 assets) | 5 | ~$0.002 | $0.01 |
| Storage + CDN + egress (per shoot amortized) | — | — | ~$0.02 |
| **Expected total variable cost / shoot** | | | **≈ $0.95–$1.05** |
| **Pessimistic (Veo Standard-ish / Try-On Max / more retries)** | | | **≈ $1.50–$1.60** |

Using **Veo 3.1 Lite @ $0.03/s** for standard plans drops the video line to ~$0.18 and the shoot to **≈ $0.55–$0.70**; **Try-On Max + Veo Standard** for BRAND/ENTERPRISE pushes it toward the pessimistic end. The cost router (§18) selects tier by plan.

**Margin check against plan prices** (AED→USD ≈ 0.272; AED/shoot = plan price ÷ included shoots):

| Plan | Price | Shoots | AED/shoot | USD/shoot revenue | AI cost (expected $1.00) | **Cost ratio** | **Gross margin** |
|---|---|---|---|---|---|---|---|
| TRY | AED 49 | 2 | 24.5 | ~$6.66 | $1.00 | **15%** | **85%** |
| BOUTIQUE | AED 199 | 10 | 19.9 | ~$5.41 | $1.00 | **18%** | **82%** |
| PROFESSIONAL | AED 499 | 30 | 16.6 | ~$4.52 | $1.00 | **22%** | **78%** |
| BRAND | AED 999 | 75 | 13.3 | ~$3.62 | $1.20 (premium models) | **33%** | **67%** |
| Credit pack (worst case) | 1 credit = AED 25 | 1 | 25 | ~$6.80 | $1.60 (pessimistic) | **24%** | **76%** |

**Conclusion:** every tier clears the **≤35% AI-cost** and **60–70%+ margin** targets with the expected cost, even on the premium-model BRAND tier. The binding constraint is the BRAND tier if it routes to Try-On Max + Veo Standard + heavy retries — the cost router must cap retries and avoid Veo Standard (audio) since audio is unused. These are **planning estimates** — actuals captured per-generation via `GenerationCost` (§15) feed the real margin dashboard (§25).

---

## 10. Proposed architecture

```
                         ┌────────────────────────────────────────────────┐
  Vendor app (:3001)     │  AYVANA Studio surface (evolve Phase 5 in place) │
  /studio, /studio/new   │  upload → QC → session → preview → approve →     │
  /studio/[id]           │  publish ; polls GET /generations/{id}           │
                         └───────────────┬────────────────────────────────┘
                                         │ server actions (sellerId resolved server-side)
                                         ▼
     ┌─────────────────────────── Next.js API (versioned /v1/ai-studio/*) ───────────────────────────┐
     │  uploads · garments · models · backgrounds · generations · subscription · plans · credits       │
     │  ENQUEUE only — never runs generation in-request                                                │
     └───────┬───────────────────────┬────────────────────────┬───────────────────────┬──────────────┘
             │ atomic reserve credit  │ append outbox + job     │ signed upload          │ billing
             ▼                        ▼                         ▼                        ▼
   CreditWallet/CreditTransaction   GenerationJob + OutboxEvent  @ayvana/storage (Blob)  @ayvana/payments
   (FOR UPDATE, Decimal)            (state machine)              (signed URLs + CDN)      (Stripe subs+packs)
                                         │
                                         ▼
          ┌──────────────── Generation Worker (AKS Deployment; first outbox consumer) ────────────────┐
          │  claim FOR UPDATE SKIP LOCKED → run state machine → call providers via @ayvana/fashion      │
          │  QUEUED→VALIDATING→ANALYZING→GENERATING_IMAGES→VALIDATING_IMAGES→GENERATING_VIDEO→           │
          │  VALIDATING_VIDEO→COMPLETED | FAILED | REVIEW_REQUIRED | CANCELLED                           │
          │  GenerationSession = consistency anchor (garment embeddings + model identity + seed +       │
          │  lighting + env + camera + provider + params) → ALL images+video derive from it             │
          │  Fidelity Engine gate BEFORE publish ; retries per policy ; DLQ → REVIEW_REQUIRED           │
          │  records GenerationCost (real $) + ProviderUsage ; moderation + C2PA on publish             │
          └───────────────┬─────────────────────────────────────────────────┬───────────────────────┘
                          ▼                                                   ▼
             @ayvana/fashion (cost router → per-op provider)        Admin app (:3002) /admin/ai-studio
   try-on FASHN · multi-view FLUX.2 · video Veo3.1 · fidelity Claude  getAuthUser ADMIN gate + SVG charts:
   · moderation Rekognition · provenance C2PA                         volume · fidelity pass% · cost/margin
```

**Data flow, concretely:**
1. Seller uploads front/back/open (+optional detail shots) → signed upload to `uploads-temp` → `GarmentImage` rows.
2. **Upload QC** (resolution/blur/lighting/occlusion/background/complete-garment/multiple-garments/front-back-correspondence). **Fails → actionable errors, NO credit consumed.**
3. On start: **atomically reserve** 1 shoot's credit (`FOR UPDATE`), create `GenerationSession` + `GenerationJob(QUEUED)` + `OutboxEvent("generation.enqueued")` in one `$transaction`.
4. Worker claims the job (`FOR UPDATE SKIP LOCKED`), runs the state machine; **Garment Intelligence** writes `GarmentAnalysis` (attributes + masks + crops + embeddings); session locks model identity + garment refs + seed.
5. 4 images generated from the session (lock everything; only camera+pose vary) → fidelity-scored.
6. Turntable video generated **conditioned on the 4 frames** → fidelity-scored.
7. Below-threshold → auto-retry per policy → after max retries → `REVIEW_REQUIRED`. Above → preview → seller approve/regenerate → publish (moderation + C2PA) → `COMPLETED`; credit `CONSUMED`. Platform failure → `RELEASED`.
8. `GenerationCost` + `ProviderUsage` recorded throughout; correlation ID links request→session→jobs→provider calls→assets→billing txn (§27).

---

## 11. Complete DB schema (Prisma-flavored; all 25 §20 models)

> **Reconcile with the "migrations" ask:** the repo uses `prisma db push`, there are **no migration files** (ADR-0007). Phase 0 ships **schema notes**, not a migration. Operator step = `pnpm --filter @ayvana/db exec prisma db push` against dev + test, versioned by this doc + the `CLAUDE.md` decisions log (the repo's convention). **UUIDs** via `@default(uuid())` for all new models (existing models use `cuid()`; new feature standardizes on `uuid()` per §20). **Money is `Decimal`, never float.** FKs on financial/audit rows use `Restrict`/`SetNull` (never cascade-delete history).

```prisma
// ───────── Identity / seller (reuse existing User; add Seller/org mapping over Vendor) ─────────
model AIStudioSeller {                       // maps a Vendor to Studio billing identity (thin)
  id           String   @id @default(uuid())
  vendorId     String   @unique              // FK → existing Vendor
  organizationId String?
  createdAt    DateTime @default(now())
  organization SellerOrganization? @relation(fields: [organizationId], references: [id], onDelete: SetNull)
  wallet       CreditWallet?
  subscription SellerSubscription?
  sessions     GenerationSession[]
  @@index([vendorId])
}

model SellerOrganization {
  id        String  @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  sellers   AIStudioSeller[]
}

// User, Seller(=AIStudioSeller over Vendor), Product reuse existing models.
// Product gains optional back-relations to generated assets (no breaking change).

// ───────── Garment intelligence ─────────
model GarmentAsset {
  id          String   @id @default(uuid())
  sellerId    String
  productId   String?                         // optional link to existing Product
  status      GarmentStatus @default(UPLOADED)
  category    String?
  silhouette  String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  images      GarmentImage[]
  analysis    GarmentAnalysis?
  sessions    GenerationSession[]
  @@index([sellerId]) @@index([sellerId, status]) @@index([productId])
}

model GarmentImage {
  id          String   @id @default(uuid())
  garmentId   String
  role        GarmentImageRole                // FRONT BACK OPEN SLEEVE EMBROIDERY BUTTON FABRIC LOGO COLLAR BELT POCKET DETAIL
  storageKey  String                          // object-storage key (NOT bytes)
  width       Int?
  height      Int?
  qcPassed    Boolean  @default(false)
  qcIssues    Json     @default("[]")         // actionable QC errors
  createdAt   DateTime @default(now())
  garment     GarmentAsset @relation(fields: [garmentId], references: [id], onDelete: Cascade)
  @@index([garmentId]) @@index([garmentId, role])
}

model GarmentAnalysis {
  id            String   @id @default(uuid())
  garmentId     String   @unique
  colors        Json                          // [{name,hex,coverage}]
  material      String?
  pattern       String?
  length        String?
  sleeve        String?
  neckline      String?
  closure       String?
  buttons       Json     @default("{}")       // {present,count,locations[]}
  embroidery    Json     @default("{}")       // {present,locations[],description}
  logo          Json     @default("{}")
  pockets       Json     @default("{}")
  belt          Json     @default("{}")
  segmentationMasks Json  @default("[]")       // storage keys for masks
  detailCrops   Json     @default("[]")        // storage keys for crops
  embeddings    Json     @default("{}")        // {model, dim, vector-ref or pgvector id}
  modelName     String                         // which analyzer produced this
  createdAt     DateTime @default(now())
  garment       GarmentAsset @relation(fields: [garmentId], references: [id], onDelete: Cascade)
}

// ───────── Model library ─────────
model AIModelProfile {
  id            String   @id @default(uuid())
  sellerId      String?                        // null = platform-shared model
  name          String
  descriptor    Json                           // synthetic identity: features, skin tone, body, hair (NO real person)
  referenceKeys Json     @default("[]")         // storage keys of locked identity references
  seed          BigInt?
  isActive      Boolean  @default(true)
  isShared      Boolean  @default(false)
  createdAt     DateTime @default(now())
  sessions      GenerationSession[]
  @@index([sellerId]) @@index([isShared, isActive])
}

// ───────── Generation session (the consistency anchor) ─────────
model GenerationSession {
  id            String   @id @default(uuid())
  sellerId      String
  garmentId     String
  modelProfileId String?
  status        SessionStatus @default(DRAFT)
  seed          BigInt?
  referenceKeys Json     @default("[]")        // locked try-on composite + garment refs
  lighting      Json     @default("{}")
  environment   Json     @default("{}")
  camera        Json     @default("{}")
  backgroundId  String?
  provider      String?                         // chosen primary provider id (audit)
  providerParams Json    @default("{}")
  resolution    String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  seller        AIStudioSeller @relation(fields: [sellerId], references: [id])
  garment       GarmentAsset   @relation(fields: [garmentId], references: [id])
  modelProfile  AIModelProfile? @relation(fields: [modelProfileId], references: [id], onDelete: SetNull)
  jobs          GenerationJob[]
  assets        GeneratedAsset[]
  fidelity      FidelityAssessment[]
  costs         GenerationCost[]
  publishing    PublishingJob[]
  @@index([sellerId]) @@index([sellerId, status]) @@index([garmentId])
}

// ───────── Jobs (async) ─────────
model GenerationJob {
  id            String   @id @default(uuid())
  sessionId     String
  kind          JobKind                         // ANALYZE | IMAGE | VIDEO | FIDELITY | PUBLISH
  state         JobState  @default(QUEUED)       // full state machine (§13)
  attempts      Int       @default(0)
  maxAttempts   Int       @default(3)
  idempotencyKey String   @unique
  availableAt   DateTime  @default(now())
  provider      String?
  providerRef   String?                          // external job id
  error         String?
  correlationId String                           // links request→session→jobs→provider→assets→billing
  creditTxnId   String?                          // the RESERVED credit txn
  startedAt     DateTime?
  finishedAt    DateTime?
  createdAt     DateTime  @default(now())
  session       GenerationSession @relation(fields: [sessionId], references: [id])
  @@index([state, availableAt]) @@index([sessionId]) @@index([correlationId])
}

model GeneratedAsset {
  id            String   @id @default(uuid())
  sessionId     String
  type          AssetType                        // IMAGE_FRONT IMAGE_BACK IMAGE_34_FRONT IMAGE_34_BACK VIDEO_TURNTABLE
  storageKey    String
  cdnUrl        String?                          // set only after publish
  provider      String
  providerModel String
  width         Int?
  height        Int?
  durationSec   Decimal? @db.Decimal(5,2)
  c2paSigned    Boolean  @default(false)
  isSimulated   Boolean  @default(false)         // placeholder output — never publishable in prod
  createdAt     DateTime @default(now())
  session       GenerationSession @relation(fields: [sessionId], references: [id])
  fidelity      FidelityAssessment[]
  @@index([sessionId]) @@index([sessionId, type])
}

model FidelityAssessment {
  id             String   @id @default(uuid())
  sessionId      String
  assetId        String?
  garmentFidelity Decimal @db.Decimal(5,4)       // 0..1
  modelConsistency Decimal @db.Decimal(5,4)
  imageQuality   Decimal  @db.Decimal(5,4)
  videoConsistency Decimal? @db.Decimal(5,4)
  breakdown      Json     @default("{}")          // per-attribute: color/pattern/embroidery+loc/silhouette/length/sleeves/buttons/closures/logo/fabric/structure
  passed         Boolean
  thresholdSetId String?                          // which config threshold set applied
  scorer         String                           // "claude-vision" | "cv-embedding"
  createdAt      DateTime @default(now())
  session        GenerationSession @relation(fields: [sessionId], references: [id])
  asset          GeneratedAsset?   @relation(fields: [assetId], references: [id], onDelete: SetNull)
  @@index([sessionId]) @@index([passed])
}

// ───────── Billing: plans, subscription, credits, packs ─────────
model SubscriptionPlan {                          // params are config-in-DB, admin-editable
  id            String   @id @default(uuid())
  code          String   @unique                  // TRY BOUTIQUE PROFESSIONAL BRAND ENTERPRISE
  name          String
  priceMonthly  Decimal  @db.Decimal(10,2)
  priceAnnual   Decimal? @db.Decimal(10,2)
  currency      String   @default("AED")
  includedShoots Int
  maxResolution String                            // e.g. "2K" | "4K"
  allowedModels Json     @default("[]")           // provider/model allowlist for this tier
  downloadsAllowed Boolean @default(true)
  rolloverShoots Int      @default(0)
  overageCreditPrice Decimal? @db.Decimal(10,2)
  monthlyLimit  Int?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  subscriptions SellerSubscription[]
}

model SellerSubscription {
  id            String   @id @default(uuid())
  sellerId      String   @unique
  planId        String
  status        SubscriptionStatus @default(ACTIVE)  // ACTIVE PAST_DUE CANCELLED TRIALING
  billingCycle  BillingCycle @default(MONTHLY)        // MONTHLY ANNUAL
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  stripeSubscriptionId String?                         // external ref
  cancelAtPeriodEnd  Boolean @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  seller        AIStudioSeller @relation(fields: [sellerId], references: [id])
  plan          SubscriptionPlan @relation(fields: [planId], references: [id], onDelete: Restrict)
  @@index([sellerId]) @@index([status])
}

model CreditWallet {
  id            String   @id @default(uuid())
  sellerId      String   @unique
  available     Decimal  @default(0) @db.Decimal(12,2)   // shoots or credits (unit = shoot)
  reserved      Decimal  @default(0) @db.Decimal(12,2)
  lifetimeConsumed Decimal @default(0) @db.Decimal(12,2)
  updatedAt     DateTime @updatedAt
  seller        AIStudioSeller @relation(fields: [sellerId], references: [id])
  transactions  CreditTransaction[]
}

model CreditTransaction {                          // APPEND-ONLY (ADR-0003 discipline)
  id            String   @id @default(uuid())
  walletId      String
  type          CreditTxnType                      // GRANT PURCHASE RESERVE CONSUME RELEASE EXPIRE ADJUST ROLLOVER
  amount        Decimal  @db.Decimal(12,2)          // signed
  balanceAfter  Decimal  @db.Decimal(12,2)          // snapshot after this entry
  sessionId     String?
  jobId         String?
  paymentId     String?
  idempotencyKey String  @unique
  note          String?
  createdAt     DateTime @default(now())
  wallet        CreditWallet @relation(fields: [walletId], references: [id], onDelete: Restrict)
  @@index([walletId]) @@index([walletId, createdAt]) @@index([sessionId])
}

model CreditPackage {                               // config-in-DB, admin-editable
  id            String   @id @default(uuid())
  code          String   @unique
  credits       Int
  price         Decimal  @db.Decimal(10,2)
  currency      String   @default("AED")
  isActive      Boolean  @default(true)
  sortOrder     Int      @default(0)
  updatedAt     DateTime @updatedAt
}

model Payment {                                     // Studio billing payments (subs + packs); mirrors PaymentTransaction discipline
  id            String   @id @default(uuid())
  sellerId      String
  kind          PaymentKind                         // SUBSCRIPTION | CREDIT_PACK
  amount        Decimal  @db.Decimal(10,2)
  currency      String   @default("AED")
  status        PaymentStatus @default(PENDING)      // reuse existing enum
  method        String                               // CARD etc.
  externalRef   String?
  idempotencyKey String  @unique
  metadata      Json     @default("{}")
  createdAt     DateTime @default(now())
  invoice       StudioInvoice?
  @@index([sellerId]) @@index([status])
}

model StudioInvoice {                               // UAE 5% VAT; reuse @ayvana/einvoice gateway + TaxInvoiceDocument
  id            String   @id @default(uuid())
  paymentId     String   @unique
  invoiceNumber String   @unique
  sellerName    String
  sellerTRN     String?
  subtotal      Decimal  @db.Decimal(10,2)
  vatRate       Decimal  @default(0.05) @db.Decimal(4,2)
  vatAmount     Decimal  @db.Decimal(10,2)
  total         Decimal  @db.Decimal(10,2)
  lines         Json
  externalRef   String?
  issuedAt      DateTime @default(now())
  payment       Payment  @relation(fields: [paymentId], references: [id], onDelete: Restrict)
}

// ───────── Providers + cost ─────────
model Provider {
  id            String   @id @default(uuid())
  code          String   @unique                  // fashn | flux2 | veo3 | kling | rekognition | claude-vision
  displayName   String
  operations    Json     @default("[]")           // ["TRYON","MULTIVIEW","VIDEO","FIDELITY","MODERATION"]
  isActive      Boolean  @default(true)
  config        Json     @default("{}")            // non-secret config; keys live in Key Vault
  models        ProviderModel[]
  usage         ProviderUsage[]
}

model ProviderModel {
  id            String   @id @default(uuid())
  providerId    String
  modelCode     String                             // e.g. "fashn/tryon/v1.6"
  operation     String
  unitCost      Decimal  @db.Decimal(10,6)         // per image / per second / per MP
  unit          String                             // IMAGE | SECOND | MEGAPIXEL | CALL
  minPlanTier   String?                            // gate premium models to premium plans
  isActive      Boolean  @default(true)
  provider      Provider @relation(fields: [providerId], references: [id], onDelete: Cascade)
  @@unique([providerId, modelCode])
}

model ProviderUsage {
  id            String   @id @default(uuid())
  providerId    String
  sessionId     String?
  jobId         String?
  operation     String
  units         Decimal  @db.Decimal(12,4)         // images/seconds/MP
  cost          Decimal  @db.Decimal(10,6)
  latencyMs     Int?
  success       Boolean
  correlationId String?
  createdAt     DateTime @default(now())
  provider      Provider @relation(fields: [providerId], references: [id], onDelete: Restrict)
  @@index([providerId, createdAt]) @@index([sessionId])
}

model GenerationCost {                              // REAL variable cost per shoot → margin engine
  id            String   @id @default(uuid())
  sessionId     String   @unique
  provider      String
  model         String
  images        Int      @default(0)
  retries       Int      @default(0)
  videoSeconds  Decimal  @default(0) @db.Decimal(6,2)
  resolution    String?
  tokens        Int      @default(0)
  gpuCost       Decimal  @default(0) @db.Decimal(10,6)
  storageCost   Decimal  @default(0) @db.Decimal(10,6)
  cdnCost       Decimal  @default(0) @db.Decimal(10,6)
  moderationCost Decimal @default(0) @db.Decimal(10,6)
  qaCost        Decimal  @default(0) @db.Decimal(10,6)
  totalVariableCost Decimal @db.Decimal(10,4)
  sellerRevenue Decimal? @db.Decimal(10,2)          // allocated plan/credit revenue for this shoot
  createdAt     DateTime @default(now())
  session       GenerationSession @relation(fields: [sessionId], references: [id], onDelete: Restrict)
  @@index([createdAt])
}

// ───────── Publishing, audit, notifications ─────────
model PublishingJob {
  id            String   @id @default(uuid())
  sessionId     String
  productId     String?
  state         JobState @default(QUEUED)
  publishedKeys Json     @default("[]")             // asset keys published to the listing
  error         String?
  createdAt     DateTime @default(now())
  finishedAt    DateTime?
  session       GenerationSession @relation(fields: [sessionId], references: [id])
  @@index([sessionId]) @@index([state])
}

model AIStudioAuditLog {                            // reuse writeAuditLog shape; separate table or reuse AuditLog
  id            String   @id @default(uuid())
  actorId       String?
  actorRole     String?
  action        String                              // "generation.enqueued","credit.reserved","publish.gated",...
  targetType    String?
  targetId      String?
  metadata      Json     @default("{}")
  correlationId String?
  createdAt     DateTime @default(now())
  @@index([action]) @@index([targetType, targetId]) @@index([createdAt])
}

model AIStudioNotification {                        // or reuse existing Notification
  id            String   @id @default(uuid())
  sellerId      String
  type          String                              // "shoot.completed","shoot.review_required","credits.low"
  payload       Json     @default("{}")
  readAt        DateTime?
  createdAt     DateTime @default(now())
  @@index([sellerId, readAt])
}

// ───────── Enums (new) ─────────
enum GarmentStatus     { UPLOADED QC_PASSED QC_FAILED ANALYZED }
enum GarmentImageRole  { FRONT BACK OPEN SLEEVE EMBROIDERY BUTTON FABRIC LOGO COLLAR BELT POCKET DETAIL }
enum SessionStatus     { DRAFT RUNNING PREVIEW APPROVED PUBLISHED REVIEW_REQUIRED FAILED CANCELLED }
enum JobKind           { ANALYZE IMAGE VIDEO FIDELITY PUBLISH }
enum JobState          { QUEUED VALIDATING ANALYZING GENERATING_IMAGES VALIDATING_IMAGES GENERATING_VIDEO VALIDATING_VIDEO COMPLETED FAILED REVIEW_REQUIRED CANCELLED }
enum AssetType         { IMAGE_FRONT IMAGE_BACK IMAGE_34_FRONT IMAGE_34_BACK VIDEO_TURNTABLE }
enum SubscriptionStatus{ ACTIVE PAST_DUE CANCELLED TRIALING }
enum BillingCycle      { MONTHLY ANNUAL }
enum CreditTxnType     { GRANT PURCHASE RESERVE CONSUME RELEASE EXPIRE ADJUST ROLLOVER }
enum PaymentKind       { SUBSCRIPTION CREDIT_PACK }
// PaymentStatus reuses the existing enum.
```

**The 25 §20 models, mapped:** User *(existing)*, Seller=`AIStudioSeller` over Vendor *(existing)*, `SellerOrganization`, Product *(existing, back-relation)*, `GarmentAsset`, `GarmentImage`, `GarmentAnalysis`, `AIModelProfile`, `GenerationSession`, `GenerationJob`, `GeneratedAsset`, `FidelityAssessment`, `SubscriptionPlan`, `SellerSubscription`, `CreditWallet`, `CreditTransaction`, `CreditPackage`, `Payment`, `Invoice=StudioInvoice`, `Provider`, `ProviderModel`, `ProviderUsage`, `GenerationCost`, `PublishingJob`, `AuditLog=AIStudioAuditLog`, `Notification=AIStudioNotification`. (All 25 present; a few reuse/extend existing tables as noted.)

---

## 12. API design (§29 — versioned, request/response schemas)

**Conventions:** versioned under `/api/v1/ai-studio/*` (seller) and `/api/v1/admin/ai-studio/*` (admin). All Next.js route handlers. **`sellerId` is always resolved server-side** from `getAuthUser()`/`safeCurrentUser()`+`getVendorByUserId`→ACTIVE — **never a request param**. Admin routes pass the three-layer gate. All money `Decimal` serialized as string. Correlation ID echoed in every response header (`x-correlation-id`).

| Method + path | Purpose | Request (body/query) | Response |
|---|---|---|---|
| `GET /products` | Seller's products eligible for a shoot | `?status` | `{ products: [{id,title,hasGarment}] }` |
| `POST /uploads` | Get signed upload URL(s) | `{ role, contentType, bytes }[]` | `{ uploads:[{key,url,headers}] }` or `{error}` |
| `POST /garments` | Create a garment from uploaded keys | `{ productId?, images:[{role,key}] }` | `{ garmentId, qc:{passed,issues[]} }` — **QC fail ⇒ no credit** |
| `GET /garments/{id}` | Garment + analysis | — | `{ garment, analysis }` |
| `GET /models` | AI model library (seller + shared) | — | `{ models:[{id,name,isShared}] }` |
| `POST /models` | Create a model profile | `{ name, descriptor }` | `{ modelId }` |
| `GET /backgrounds` | Available backgrounds/environments | — | `{ backgrounds:[...] }` |
| `POST /generations` | Start a shoot (reserve credit, enqueue) | `{ garmentId, modelProfileId?, backgroundId?, resolution? }` | `{ sessionId, jobId, status:"QUEUED" }` or `{error:"INSUFFICIENT_CREDITS"\|"FEATURE_DISABLED"}` |
| `GET /generations` | List seller's sessions | `?status&cursor` | `{ sessions:[...], nextCursor }` |
| `GET /generations/{id}` | Session detail (polled) | — | `{ session, jobs:[{kind,state}], assets:[{type,signedUrl}], fidelity:[...], status }` |
| `POST /generations/{id}/regenerate` | Bounded regenerate | `{ scope:"images"\|"video"\|"all" }` | `{ jobId }` or `{error:"RETRY_LIMIT"}` |
| `POST /generations/{id}/approve` | Seller approves preview | — | `{ status:"APPROVED" }` |
| `POST /generations/{id}/publish` | Publish to listing / mark downloadable | `{ productId? }` | `{ publishingJobId }` or `{error:"FIDELITY_GATE"\|"MODERATION"}` |
| `GET /subscription` | Current subscription + usage | — | `{ plan, status, periodEnd, shootsUsed, shootsIncluded }` |
| `GET /plans` | Active plans (config-in-DB) | — | `{ plans:[{code,name,priceMonthly,priceAnnual,includedShoots,...}] }` |
| `POST /subscription` | Subscribe / upgrade / downgrade | `{ planCode, cycle }` | `{ clientSecret? } ` (Stripe) or `{ status }` |
| `GET /credits` | Wallet balance + ledger | `?cursor` | `{ available, reserved, transactions:[...] }` |
| `POST /credits/purchase` | Buy a credit pack | `{ packageCode }` | `{ clientSecret }` (order-first) |
| `GET /usage` | Seller usage + cost-hidden shoot history | `?period` | `{ shoots:[...], totals }` |
| `GET /admin/ai-studio/overview` | Platform KPIs | `?period=7\|30\|90` | `{ volume, fidelityPassRate, cost, revenue, margin, providerMix }` |
| `GET /admin/ai-studio/generations` | All sessions (moderation/ops) | `?status&cursor` | `{ sessions:[...] }` |
| `GET /admin/ai-studio/costs` | Cost/margin report | `?period` | `{ perPlan:[...], perProvider:[...] }` |
| `PATCH /admin/ai-studio/plans/{id}` | Edit plan params (no deploy) | `{ price?, includedShoots?, allowedModels?, ... }` | `{ plan }` |
| `PATCH /admin/ai-studio/packages/{id}` | Edit credit-pack params | `{ credits?, price? }` | `{ package }` |
| `PATCH /admin/ai-studio/thresholds` | Edit fidelity thresholds | `{ garmentFidelity, modelConsistency, ... }` | `{ ok }` |
| `POST /webhooks/stripe-studio` | Subscription/pack webhook | raw body + sig | `200` (idempotent `applyPaymentResult`-style) |

**Webhook note:** reuse `@ayvana/payments` signature verification + idempotent reconcile. Subscriptions use Stripe subscription events (`invoice.paid`, `customer.subscription.updated/deleted`) → `SellerSubscription` state; packs use the existing order-first intent flow.

---

## 13. Job / workflow design (§21)

**The queue is net-new, built as the first real consumer of the already-designed outbox (ADR-0005).**

**State machine (per the spec):**
```
QUEUED → VALIDATING → ANALYZING → GENERATING_IMAGES → VALIDATING_IMAGES
       → GENERATING_VIDEO → VALIDATING_VIDEO → COMPLETED
Branches: → FAILED (terminal, platform error → credit RELEASED)
          → REVIEW_REQUIRED (fidelity below threshold after max retries)
          → CANCELLED (seller cancels before terminal)
```

- **Enqueue (in the API `$transaction`):** reserve credit (`FOR UPDATE`) → create `GenerationSession` + `GenerationJob(QUEUED, idempotencyKey, correlationId)` + `appendOutboxEvent(tx, {type:"generation.enqueued", payload:{jobId}})`. Atomic: no "committed but event lost".
- **Claim:** worker runs `processOutbox()` (exists) **and/or** claims `GenerationJob` rows directly with `UPDATE … WHERE id IN (SELECT id FROM "GenerationJob" WHERE state=... AND availableAt<=now() FOR UPDATE SKIP LOCKED) RETURNING …` (the ADR-0005 pattern). Visibility timeout prevents stuck jobs.
- **Idempotency:** every job has a unique `idempotencyKey`; provider calls pass it; re-delivery is a no-op if the asset already exists. Fidelity + publish steps are idempotent by `(sessionId, assetType)`.
- **Retries / DLQ:** each `kind` has `maxAttempts` (default 3). Transient provider/platform errors → backoff (`availableAt = now + backoff(attempts)`). On `attempts >= maxAttempts`: image/video → fidelity retry policy; exhausted → `REVIEW_REQUIRED` (not silent FAIL). True platform FAIL → `FAILED` + credit `RELEASED`.
- **Credit coupling:** `RESERVE` at enqueue; `CONSUME` only at `COMPLETED`/approved-publish; `RELEASE` on `FAILED`/platform error/`CANCELLED`. Never consume on platform failure (R1).

**MVP path (ship Phase 1–3):** a single Node **worker process** packaged as its own container (`docker/Dockerfile` target `worker`) deployed as an AKS `Deployment` (1–2 replicas) that loops `processOutbox()` + the job claimer on an interval. Local dev: the same worker runnable via `pnpm --filter @ayvana/worker dev`; with no provider keys it drives `SimulatedFashionProvider` end-to-end so the whole pipeline runs offline.

**Scale path (Phase 5–6):** promote the outbox handler to publish onto **Azure Service Bus**; scale workers with **KEDA** (queue-length-based HPA) on AKS; long video jobs on a dedicated node pool. The outbox stays the reliable source (at-least-once), so this is a deployment change, not a rewrite.

---

## 14. Security + AI-safety design (§23–24)

**AuthZ / tenancy (§23):**
- `sellerId` server-resolved every call; every query scoped by it; cross-tenant read/write impossible by construction (the supplier/vendor pattern, proven across the repo).
- Admin surfaces behind the **three-layer gate** (middleware + `(dashboard)/layout` + per-action `getAuthUser` ADMIN).
- Signed, short-TTL, per-asset storage URLs; raw uploads in a private container; published CDN URLs only post-approval.
- Billing never trusts the browser: server recomputes price/credits; webhooks signature-verified + idempotent; order-first.
- Feature gate `fashionAvailable(op)` checked server-side before enqueue AND publish (prod-safe Simulated, R2).

**AI safety + provenance (§24):**
- **Moderation gate** (Rekognition/Hive) on every generated asset before preview/publish; disallowed content blocks publish and flags admin review.
- **Fidelity gate** (hard, before publish) — never publish below the commerce-safety threshold (R3).
- **Synthetic models only** — `AIModelProfile.descriptor` is a synthetic identity, no real-person likeness; a documented model-consent/usage policy ships with Phase 1.
- **Provenance** — embed **C2PA Content Credentials** on every published image/video (`GeneratedAsset.c2paSigned`); satisfies EU AI Act (Aug 2026) AI-content labelling.
- **Untrusted vision output** — all model JSON is schema-validated; no free-form model text drives money-moving or publish actions without the deterministic gates.
- **Simulated assets** are watermarked and `isSimulated=true` → never publishable in prod.
- **Audit** — `writeAuditLog`-style entries on reserve/consume/release, publish-gated, admin threshold edits, moderation blocks — correlation-ID-linked.

---

## 15. Financial / credit-flow design (§15–17)

**Credit wallet + append-only ledger** (modeled on `supplier-payouts.ts` + `ledger.ts` + ADR-0003):

```
reserveCredit(sellerId, shoots=1, idemKey):
  $transaction:
    SELECT id FROM "CreditWallet" WHERE sellerId=? FOR UPDATE      -- row lock
    if available < shoots: return {ok:false, reason:"INSUFFICIENT_CREDITS"}
    wallet.available -= shoots ; wallet.reserved += shoots
    append CreditTransaction{ type:RESERVE, amount:-shoots, balanceAfter:available, idempotencyKey }
    return {ok:true, creditTxnId}

consumeCredit(sessionId):   -- on COMPLETED/approved publish
  $transaction + FOR UPDATE: reserved -= shoots ; lifetimeConsumed += shoots
    append CreditTransaction{ type:CONSUME, balanceAfter, idempotencyKey:`consume:${sessionId}` }

releaseCredit(sessionId):   -- on platform FAIL / CANCELLED
  $transaction + FOR UPDATE: reserved -= shoots ; available += shoots
    append CreditTransaction{ type:RELEASE, balanceAfter, idempotencyKey:`release:${sessionId}` }
```

- **Atomic, row-locked, idempotent** (unique `idempotencyKey` prevents double-consume). **Decimal only.** `balanceAfter` snapshot on every entry. Rows never UPDATE/DELETE; corrections are reversing `ADJUST` entries.
- **Never charge for platform failures** (R1): the pipeline distinguishes platform/infra errors (always `RELEASE`) from provider-business failures (policy-driven per §19).
- **Grants:** subscription renewal grants `includedShoots` (`type:GRANT`) with optional `ROLLOVER` per plan config; pack purchase grants on webhook `payment_succeeded` (`type:PURCHASE`).

**Cost / margin engine (§17):** the worker records real cost into `GenerationCost` (provider/model/images/retries/video-sec/resolution/tokens/gpu/storage/cdn/moderation/qa → `totalVariableCost`) and `ProviderUsage` per call. Allocated `sellerRevenue` = (plan price ÷ included shoots) or credit-pack unit price for that shoot. The admin dashboard computes **Seller Revenue, Variable AI Cost, Gross Contribution, Gross Margin%** per plan/provider/period and flags any cohort breaching **AI-cost > 35%** or **margin < 60%**.

**Cost router (§18 of spec):** `chooseProvider(op, {qualityReq, garmentComplexity, plan, resolution, availability, historicalFidelity, unitCost})` → provider+model. Premium plans (BRAND/ENTERPRISE) unlock Try-On Max / Nano Banana Pro / Veo higher tiers via `SubscriptionPlan.allowedModels` + `ProviderModel.minPlanTier`. **Hard rule: never drop a provider below the commerce-safety fidelity floor to save cost.** Retry economics (§19): each retry increments `GenerationCost.retries`; retries bounded per plan; a session whose projected cost would breach the margin floor routes to `REVIEW_REQUIRED` rather than burning unbounded spend.

---

## 16. Implementation plan (mapped to spec Phases 1–6)

| Phase | Deliverable | Key work | Gatekeeper |
|---|---|---|---|
| **P1 — Foundations** | Schema + storage + provider skeleton, keyless | `prisma db push` all 25 models (operator); `@ayvana/storage` (Blob + Simulated); `@ayvana/fashion` gateway + `SimulatedFashionProvider`; worker package skeleton consuming outbox | Full `tsc` + lint green; pipeline runs end-to-end with Simulated (placeholder assets) offline |
| **P2 — Upload + Garment Intelligence** | Real QC + analysis | Signed upload wizard (evolve `/studio/new`); QC validators (resolution/blur/lighting/occlusion/background/complete/multiple/front-back); `GarmentAnalysis` (Claude vision + masks/crops/embeddings). **QC fail ⇒ no credit** | QC errors actionable; analysis persisted; no credit on fail |
| **P3 — Generation session + images** | Real 4-image generation + fidelity | `GenerationSession` anchor; FASHN try-on + FLUX.2 multi-view adapters (config-gated); image Fidelity Engine; preview/approve/regenerate UI | Same model/garment across 4 angles; fidelity gate blocks bad images |
| **P4 — Video turntable** | 360° turntable, frame-conditioned | Veo 3.1 adapter (frames→video); video fidelity; turntable default pose sequence | Video conditioned on the 4 frames, not text; video fidelity gate |
| **P5 — Monetization** | Subscriptions + credits + billing | Plans/packages config-in-DB + admin edit UI; `CreditWallet`/`CreditTransaction` (reserve/consume/release); Stripe subs + pack purchase; UAE VAT invoices via `@ayvana/einvoice` + `TaxInvoiceDocument`; cost router + `GenerationCost` capture | Atomic credit, never-charge-on-failure (concurrency tests); webhook idempotency; margins within target |
| **P6 — Admin + publish + scale** | Oversight + publishing + provenance + scale | Admin `/admin/ai-studio` dashboard (SVG charts, period toggle, cost/margin); publish-to-listing + download; moderation + C2PA; Azure Service Bus + KEDA scale path; observability correlation IDs end-to-end | Fidelity pass-rate + margin dashboards; publish gated; provenance on every asset |

---

## 17. Exact files / modules to create or modify

**New shared packages**
- `packages/fashion/` — `src/{gateway.ts, config.ts, factory.ts, simulated.ts, router.ts, adapters/{fashn.ts, flux.ts, veo.ts, kling.ts, claude-fidelity.ts, rekognition.ts, c2pa.ts}, index.ts}`. Interface `FashionGenerationProvider` with per-op methods (`tryOn`, `multiView`, `imageToVideo`, `scoreFidelity`, `moderate`); discriminated-union results; `getFashionProvider(op)` factory (never throws); `SimulatedFashionProvider`; `fashionAvailable(op)`; `hasFashn()/hasFlux()/hasVeo()/...`.
- `packages/storage/` — `src/{gateway.ts, config.ts, factory.ts, simulated.ts, azure-blob.ts, index.ts}`. `StorageGateway` (signedUpload/signedRead/delete); `hasBlobStorage()`; Simulated local/`data:` fallback.
- `packages/worker/` — `src/{index.ts, claim.ts, handlers/{analyze.ts, image.ts, video.ts, fidelity.ts, publish.ts}, state-machine.ts}`. Runs `processOutbox` + `GenerationJob` claimer; its own Dockerfile target.

**`packages/db`**
- `prisma/schema.prisma` — add all §11 models + enums (operator `db push`; no migration file, per ADR-0007).
- `src/credits.ts` — `reserveCredit/consumeCredit/releaseCredit/grantCredit` (`FOR UPDATE`, Decimal, idempotent) + `computeWallet`.
- `src/ai-studio-settings.ts` — plan/package/threshold config helpers (settings-registry style) *(or extend `settings.ts`)*.
- `src/index.ts` — barrel exports.

**`packages/ai`**
- `src/agents/studio.ts` — replace the stubbed `generate_images`/`generate_video` tools with calls through `@ayvana/fashion`; keep `detectGarment`/`writeCopy`; add `analyzeGarment` (attributes+masks+crops+embeddings) + `scoreFidelity` helpers.
- `src/index.ts` — export new helpers.

**`apps/vendor`** (evolve the Studio surface in place)
- `app/(dashboard)/studio/page.tsx`, `new/page.tsx`, `[id]/page.tsx` — upgrade list/wizard/results: signed upload, QC feedback, session preview with per-asset fidelity, approve/regenerate/publish, swap meta-refresh for a polling fetch of `GET /generations/{id}`.
- `app/(dashboard)/studio/billing/page.tsx` *(new)* — plans, subscription, credits, packs, invoices.
- `app/actions/studio.ts` — replace `triggerStudioPipeline` with `startGeneration` (reserve credit + enqueue), `regenerate`, `approveGeneration`, `publishGeneration` (all `sellerId` server-resolved, ACTIVE-gated).
- `app/actions/studio-billing.ts` *(new)* — subscribe/upgrade/downgrade, purchase pack.
- `app/api/v1/ai-studio/**/route.ts` *(new)* — the §12 seller routes.
- `app/api/webhooks/stripe-studio/route.ts` *(new)* — subscription/pack webhook.

**`apps/admin`**
- `app/(dashboard)/ai-studio/{page.tsx, generations/page.tsx, costs/page.tsx, plans/page.tsx, thresholds/page.tsx}` *(new)* — getAuthUser-gated RSC; reuse `LineChart`/`BarChart`/`PeriodToggle`.
- `app/actions/ai-studio.ts` *(new)* — ADMIN-gated plan/package/threshold edits + moderation actions.
- `app/(dashboard)/components/Sidebar.tsx` — add "✨ AI Studio" nav.

**`packages/ui`**
- Reuse `TaxInvoiceDocument`; add `FidelityBadge`, `AssetGallery`, `ShootProgress` (poll-driven) if needed.

**Config / infra**
- `.env.example` — `FASHN_API_KEY`, `FLUX_API_KEY`/`FAL_KEY`, `VEO_API_KEY`/`GEMINI_API_KEY`, `KLING_API_KEY`, `MODERATION_PROVIDER`+key, `AZURE_STORAGE_ACCOUNT`/`AZURE_STORAGE_CONTAINER`, optional `SERVICE_BUS_CONNECTION`, `REDIS_URL` *(already present)*.
- `docker/Dockerfile` — add `worker` build target.
- `infra/helm/ayvana` — worker `Deployment` + (P6) KEDA ScaledObject; `infra/bicep` — Blob storage account + Service Bus (P6); Key Vault secrets for provider keys.
- `docs/deployment/ai-studio.md` *(new)* — operator activation (keys, `db push`, storage, worker, webhook registration).

---

## 18. Assumptions requiring the user's approval

> These are the decisions I made to produce a complete design; each needs a yes/no before Phase 1. Ordered by impact.

- **A — Extend-the-surface, replace-the-engine.** Keep the `/studio` routes + `StudioUpload` as legacy/thin, but route all real generation through the new session/job/credit model and `@ayvana/fashion`. *(Alternative: a brand-new `/ai-studio` surface + migrate. Recommended: extend-in-place — less churn, reuses the shipped UX.)*
- **B — Provider combination.** FASHN v1.6 (try-on) + FLUX.2 / Nano Banana Pro (multi-view/identity) + Veo 3.1 (turntable, Kling fallback) + Claude vision + in-house CV (fidelity) + Rekognition/Hive (moderation) + C2PA (provenance), mostly via fal/Replicate aggregators. *(Confirm the combination and the aggregator-vs-direct stance; prices are Oct-2026 list, to re-confirm.)*
- **C — Storage = Azure Blob (UAE North)**, not Cloudinary or S3, behind `@ayvana/storage` with a Simulated fallback. *(Confirm Blob over Cloudinary/S3; confirm 30-day temp-upload retention.)*
- **D — Queue = DB/outbox-backed Node worker (MVP) → Azure Service Bus + KEDA (scale).** The worker is net-new as the first real outbox consumer. *(Confirm MVP-first over going straight to Service Bus.)*
- **E — All-Node, no Python AI service.** Providers are HTTP APIs reached from the Node worker; in-house CV (embeddings/histograms) runs in Node (or a thin Python sidecar only if a specific model demands it). *(Confirm; a Python sidecar would add a 2nd runtime to AKS.)*
- **F — `db push` + schema notes, not migration files** (per ADR-0007). Operator runs `prisma db push` on dev + test; this doc + the `CLAUDE.md` decisions log are the version record. *(Confirm you accept the no-migration-files convention for these 25 models; UUID PKs for all new models.)*
- **G — Reuse `@ayvana/einvoice` + `TaxInvoiceDocument` for Studio billing VAT invoices** (UAE 5%, seller is the buyer of the Studio subscription/pack from AYVANA; AYVANA's TRN on the invoice). *(Confirm AYVANA issues the tax invoice to the seller; VAT treatment — likely VAT-exclusive on the AED plan price.)*
- **H — Credit unit = "AI Shoot"** (not raw GPU/token credits), hidden provider cost, bounded retries included in the shoot. *(Confirm the shoot bundle: 4 images + 1 turntable + N retries + publish.)*
- **I — Synthetic AI models only + C2PA on all published assets + moderation gate**, with a model-consent/usage policy authored in Phase 1. *(Confirm the no-real-likeness policy and EU-AI-Act provenance stance.)*
- **J — Self-hosted models deferred.** Start fully API-based; revisit self-hosting (cost control at scale) only after real `GenerationCost` data justifies it. *(Confirm defer.)*

---

## Appendix — provider sources

- FASHN API + v1.6 docs + Try-On Max: https://fashn.ai/products/api , https://docs.fashn.ai/api-reference/tryon-v1-6 , https://fashn.ai/changelog/api-try-on-max-endpoint-now-available , pricing https://fashn.ai/blog/pricing-update-for-developer-api
- fal virtual try-on roundup (FLUX Try-On, Kling Kolors, prices): https://fal.ai/learn/tools/best-virtual-try-on-apis-2026
- Google Gemini image ("Nano Banana") pricing: https://ai.google.dev/gemini-api/docs/pricing
- FLUX.2 / FLUX Kontext multi-reference consistency: https://linocut.ai/blogs/multi-reference-ai-image-models/ , https://www.flixly.ai/blog/flux-kontext-review-character-consistency-2026
- ByteDance Seedream: https://tryinfer.com/models/seedream-4-0
- Google Veo 3.1 Reference-to-Video: https://developers.googleblog.com/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/ , https://replicate.com/google/veo-3.1
- Video API pricing (Veo/Kling/Runway): https://www.cometapi.com/ai-video-api-pricing/ , https://unifically.com/blogs/runway-gen-4
- Moderation (Rekognition/Hive): https://wring.co/blog/aws-rekognition-pricing-guide , https://thehive.ai/pricing
- C2PA / Content Credentials + EU AI Act: https://contentauthenticity.org/blog/the-state-of-content-authenticity-in-2026 , https://en.wikipedia.org/wiki/Content_Credentials
- DRESSX (enterprise try-on): https://en.wikipedia.org/wiki/DRESSX
