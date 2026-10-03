// Shared studio service types. The service layer orchestrates the AI Fashion
// Studio pipeline and is called by BOTH the vendor app (enqueue) and the worker
// (run). Every operation is vendor-scoped — vendorId is resolved by the caller
// (server-side) and ownership is re-checked on every read/write so Seller A can
// never touch Seller B's garments/sessions/assets.

export const OUTBOX_GENERATION_ENQUEUED = "studio.generation.enqueued" as const;

export type StartGenerationInput = {
  vendorId: string;
  garmentId: string;
  modelProfileId?: string | null;
  productId?: string | null;
  backgroundId?: string | null;
  resolution?: string | null;
  seed?: number | null;
  /** Caller-supplied idempotency key; a duplicate returns the SAME job/session. */
  idempotencyKey: string;
  correlationId: string;
};

export type StartGenerationResult =
  | { ok: true; sessionId: string; jobId: string; deduped: boolean }
  | { ok: false; reason: "GARMENT_NOT_FOUND" | "NOT_OWNED" | "VENDOR_INACTIVE" | "ERROR"; message?: string };
