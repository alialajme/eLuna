// FashionGenerationProvider — the credential-gated generation abstraction for
// the AI Fashion Studio. Mirrors the repo's payments/courier/einvoice gateways:
// interface → SimulatedFashionProvider (keyless, offline-complete) → config-gated
// per-operation adapter SCAFFOLDS → factory that never throws.
//
// Every method returns a discriminated-union result (never throws to the caller).
// Each generated asset carries `isSimulated`, so simulated output can be blocked
// from publish in production (the ADR R2 prod-safety rule — enforced by callers).
//
// Phase 1 ships ONLY the interface + Simulated provider + config-gated scaffolds.
// No live provider calls are made this phase.

import type { StoragePrefix } from "@ayvana/storage";

/** Per-operation capability keys used by config gates + the (future) cost router. */
export type FashionOperation =
  | "ANALYZE"
  | "TRYON"
  | "MULTIVIEW"
  | "VIDEO"
  | "FIDELITY"
  | "MODERATION";

/** A storage-key reference to an image/video the provider should read or wrote. */
export type AssetRef = { storageKey: string; prefix?: StoragePrefix };

// ───────── validateUpload ─────────
export type UploadDescriptor = {
  role: string; // GarmentImageRole value
  contentType: string;
  bytes: number;
  width?: number;
  height?: number;
};

export type UploadValidationIssue = {
  code:
    | "UNSUPPORTED_TYPE"
    | "TOO_LARGE"
    | "TOO_MANY"
    | "TOO_FEW"
    | "LOW_RESOLUTION"
    | "MISSING_FRONT";
  role?: string;
  message: string;
};

export type ValidateUploadResult = { passed: boolean; issues: UploadValidationIssue[] };

// ───────── analyzeGarment ─────────
export type AnalyzeGarmentParams = {
  images: AssetRef[];
  correlationId: string;
};

export type GarmentAnalysisResult = {
  category: string | null;
  silhouette: string | null;
  colors: { name: string; hex: string; coverage: number }[];
  material: string | null;
  pattern: string | null;
  length: string | null;
  sleeve: string | null;
  neckline: string | null;
  closure: string | null;
  buttons: Record<string, unknown>;
  embroidery: Record<string, unknown>;
  logo: Record<string, unknown>;
  pockets: Record<string, unknown>;
  belt: Record<string, unknown>;
  segmentationMasks: string[]; // storage keys
  detailCrops: string[]; // storage keys
  embeddings: Record<string, unknown>;
  modelName: string;
};

export type AnalyzeGarmentResult =
  | { status: "ok"; analysis: GarmentAnalysisResult }
  | { status: "failed"; error: string };

// ───────── virtualTryOn ─────────
export type VirtualTryOnParams = {
  garmentImages: AssetRef[];
  modelReferenceKeys: string[];
  seed?: number;
  correlationId: string;
  /** Where the provider should write the composite. */
  outKeyPrefix: string;
};

export type GeneratedImage = {
  storageKey: string;
  width: number;
  height: number;
  provider: string;
  providerModel: string;
  isSimulated: boolean;
};

export type VirtualTryOnResult =
  | { status: "ok"; composite: GeneratedImage }
  | { status: "failed"; error: string };

// ───────── generateMultiView ─────────
/** The four locked angles (model/garment/color fixed; only camera/pose vary). */
export type ViewAngle = "IMAGE_FRONT" | "IMAGE_BACK" | "IMAGE_34_FRONT" | "IMAGE_34_BACK";

export type GenerateMultiViewParams = {
  compositeKey: string; // the try-on composite anchor
  garmentImages: AssetRef[];
  modelReferenceKeys: string[];
  seed?: number;
  angles: ViewAngle[];
  correlationId: string;
  outKeyPrefix: string;
};

export type MultiViewImage = GeneratedImage & { angle: ViewAngle };

export type GenerateMultiViewResult =
  | { status: "ok"; images: MultiViewImage[] }
  | { status: "failed"; error: string };

// ───────── generateVideo ─────────
export type GenerateVideoParams = {
  /** The generated frames the turntable is conditioned on (not text-only). */
  frameKeys: string[];
  seed?: number;
  durationSec: number;
  correlationId: string;
  outKeyPrefix: string;
};

export type GeneratedVideo = {
  storageKey: string;
  durationSec: number;
  provider: string;
  providerModel: string;
  isSimulated: boolean;
};

export type GenerateVideoResult =
  | { status: "ok"; video: GeneratedVideo }
  | { status: "failed"; error: string };

// ───────── validateGarmentFidelity ─────────
export type FidelityParams = {
  sourceKeys: string[];
  generatedKey: string;
  correlationId: string;
};

export type FidelityResult =
  | {
      status: "ok";
      garmentFidelity: number; // 0..1
      modelConsistency: number;
      imageQuality: number;
      breakdown: Record<string, number>;
      scorer: string;
    }
  | { status: "failed"; error: string };

// ───────── moderateContent ─────────
export type ModerationParams = { assetKey: string; correlationId: string };

export type ModerationResult =
  | { status: "ok"; allowed: boolean; labels: string[]; provider: string }
  | { status: "failed"; error: string };

export interface FashionGenerationProvider {
  /** Provider id for audit/cost attribution. */
  readonly id: string;
  /** True only for the Simulated provider (so callers can block publish in prod). */
  readonly isSimulated: boolean;

  validateUpload(uploads: UploadDescriptor[]): ValidateUploadResult;
  analyzeGarment(params: AnalyzeGarmentParams): Promise<AnalyzeGarmentResult>;
  virtualTryOn(params: VirtualTryOnParams): Promise<VirtualTryOnResult>;
  generateMultiView(params: GenerateMultiViewParams): Promise<GenerateMultiViewResult>;
  generateVideo(params: GenerateVideoParams): Promise<GenerateVideoResult>;
  validateGarmentFidelity(params: FidelityParams): Promise<FidelityResult>;
  moderateContent(params: ModerationParams): Promise<ModerationResult>;
}

/** The four canonical angles of an AI Shoot. */
export const SHOOT_ANGLES: ViewAngle[] = [
  "IMAGE_FRONT",
  "IMAGE_34_FRONT",
  "IMAGE_34_BACK",
  "IMAGE_BACK",
];

/** Shared upload constraints (QC runs BEFORE generation; consumes no credit). */
export const UPLOAD_LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  minImages: 2,
  maxImages: 12,
  minDimension: 512,
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
} as const;
