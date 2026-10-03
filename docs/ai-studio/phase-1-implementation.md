# AI Fashion Studio — Phase 1 Implementation Notes

**Status:** Shipped (Phase 1 — foundation). Builds and runs **fully keyless**.
**Scope:** Productionizes the stubbed Phase 5 Studio into a real, async, provider-
abstracted generation pipeline. Phases 2–5 (fidelity engine, real video,
credits/subscriptions, admin dashboard) are out of scope; clean seams are left
for them. See the Phase 0 ADR (`2026-10-01-ai-fashion-studio-phase-0-adr.md`).

## What Phase 1 ships

1. **Schema** — `GarmentAsset`, `GarmentImage`, `GarmentAnalysis`, `AIModelProfile`,
   `GenerationSession`, `GenerationJob`, `GeneratedAsset`, `Provider`,
   `ProviderModel` (UUID PKs, `Decimal` money, every asset chains to a
   `vendorId`). Pushed with `prisma db push` to the dev + test DBs — **no
   migration files** (repo convention, ADR-0007). `StudioUpload` is left intact
   as the frozen legacy record.
2. **`@ayvana/storage`** — object-storage gateway. `SimulatedStorage`
   (local-disk, with a data-URI/in-memory fallback) is the keyless default;
   `AzureBlobStorage` is a config-gated scaffold. Keys are namespaced by prefix
   (`original/generated/thumb/video/temp`); the DB stores keys, never bytes.
3. **`@ayvana/fashion`** — `FashionGenerationProvider` abstraction
   (`validateUpload`, `analyzeGarment`, `virtualTryOn`, `generateMultiView`,
   `generateVideo`, `validateGarmentFidelity`, `moderateContent`).
   `SimulatedFashionProvider` is keyless and offline-complete (real QC +
   deterministic placeholder images + a stub video). FASHN / FLUX / Veo adapters
   are config-gated SCAFFOLDS (no live calls this phase).
4. **`@ayvana/studio`** — the service layer + worker (see below).
5. **Vendor `/studio` surface** — upload wizard → QC feedback → backdrop select
   → generate → results screen that polls job status.

## Architecture

```
Vendor /studio/new (client)
  ├─ POST /api/v1/ai-studio/uploads  → @ayvana/storage.put → storage keys
  ├─ createGarmentAction  → @ayvana/studio.createGarment  → QC gate (no job on fail)
  └─ beginShootAction     → @ayvana/studio.startGeneration
                               └─ $transaction: GenerationSession + QUEUED job + OutboxEvent
                                                     │
                     ┌───────────────────────────────┘  (no long-held HTTP)
                     ▼
  @ayvana/studio worker  → processOutbox (FOR UPDATE SKIP LOCKED) → runGenerationJob
     QUEUED→VALIDATING→ANALYZING→GENERATING_IMAGES→VALIDATING_IMAGES→
     GENERATING_VIDEO→VALIDATING_VIDEO→COMPLETED  (FAILED | REVIEW_REQUIRED)
                     │
  Vendor /studio/[id]  ← GET /api/v1/ai-studio/generations/[id] (polled; signed URLs)
```

The **GenerationSession is the consistency anchor**: the four views (front, back,
¾-front, ¾-back) all derive from one session (one garment + model identity +
seed), so only camera/pose vary. The **fidelity floor** (`FIDELITY_FLOOR` in
`packages/studio/src/pipeline.ts`) is a hard gate before any publish; below it
the session goes to `REVIEW_REQUIRED`, never published.

## Security / isolation

- `vendorId` is **always resolved server-side** (`safeCurrentUser` →
  `getVendorByUserId` → ACTIVE) and never accepted from the client.
- Every read/write is vendor-scoped. A non-owner reading another seller's
  session gets the same result as a missing one (404 / null — undisclosed
  existence). Proven by `packages/studio/test/isolation.int.test.ts`.
- `beginShootAction` is server-gated by `fashionAvailable("TRYON")`: in
  production with no provider keys the feature is disabled, not fake-captured.
  Simulated assets carry `isSimulated=true` and are never publishable in prod.
- Generation start is idempotent (`idempotencyKey`) — a duplicate returns the
  same job (no double-generation); a cross-vendor key replay is refused.
- Asset URLs are signed, short-TTL.

## Running it (keyless, local)

```bash
# 1. Push schema to dev + test DBs (no migration files)
DATABASE_URL=postgresql://postgres:password@localhost:5432/eluna \
  pnpm --filter @ayvana/db exec prisma db push
DATABASE_URL=postgresql://postgres:password@localhost:5432/ayvana_test \
  pnpm --filter @ayvana/db exec prisma db push

# 2. Run the vendor app
pnpm --filter @ayvana/vendor dev          # http://localhost:3001/studio

# 3. Run the generation worker (separate terminal). With no provider keys it
#    drives SimulatedFashionProvider end-to-end so shoots complete offline.
pnpm --filter @ayvana/studio worker

# 4. Tests
pnpm --filter @ayvana/studio test
```

## Operator activation (going live)

### Storage (Azure Blob, UAE North)
1. Provision a storage account + container (co-located with AKS/Postgres).
2. Set `AZURE_STORAGE_ACCOUNT` + `AZURE_STORAGE_CONTAINER`; in prod authenticate
   via the existing workload-identity SA (no account key).
3. Implement `AzureBlobStorage` in `packages/storage/src/azure-blob.ts`
   (`TODO(operator)` markers): add `@azure/storage-blob` + `@azure/identity`,
   generate user-delegation SAS for `signedUpload`/`getSignedUrl`, map prefixes
   to container paths, and add a lifecycle rule to expire the `temp` prefix.
4. The upload route can then hand the browser signed PUT URLs instead of
   proxying bytes.

### Generation providers
- Set the relevant keys (see `.env.example`): `FAL_KEY` / `REPLICATE_API_TOKEN`
  aggregators, or `FASHN_API_KEY` (try-on), `FLUX_API_KEY` (multi-view),
  `VEO_API_KEY`/`GEMINI_API_KEY` (video).
- Implement the owned method in each scaffold
  (`packages/fashion/src/adapters.ts`): download the provider output, `put()` it
  to storage, return the key. Each scaffold currently returns a `failed` result
  (never fake success); unowned operations delegate to the Simulated provider.
- `fashionAvailable(op)` + `getFashionProvider(op)` already route a configured op
  to its real adapter and leave the rest on the Simulated/Claude+CV path.

### Worker in production
- Package the worker as an AKS `Deployment` (1–2 replicas) running
  `pnpm --filter @ayvana/studio worker`. Because the outbox claim uses
  `FOR UPDATE SKIP LOCKED`, replicas take disjoint work and never double-process.
- Scale path (ADR §13): promote the outbox to Azure Service Bus + KEDA — a
  deployment change, not a rewrite.

## Deliberately deferred (seams left)

- **Phase 2** — real QC analysis + Claude-vision fidelity scoring + config-in-DB
  thresholds + retry loop (the floor constant and `REVIEW_REQUIRED` branch exist).
- **Phase 3** — real frame-conditioned video (the `VIDEO` state + stub asset exist).
- **Phase 4** — credits/subscriptions/VAT billing (`Provider`/`ProviderModel`
  registry + session→Vendor relation leave the seam; no `CreditWallet` yet).
- **Phase 5** — admin `/admin/ai-studio` dashboard + publish-to-listing + C2PA.
