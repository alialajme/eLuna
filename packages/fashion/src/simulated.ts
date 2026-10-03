import { createHash } from "node:crypto";
import { getStorage } from "@ayvana/storage";
import type {
  FashionGenerationProvider,
  UploadDescriptor,
  ValidateUploadResult,
  UploadValidationIssue,
  AnalyzeGarmentParams,
  AnalyzeGarmentResult,
  VirtualTryOnParams,
  VirtualTryOnResult,
  GenerateMultiViewParams,
  GenerateMultiViewResult,
  MultiViewImage,
  GenerateVideoParams,
  GenerateVideoResult,
  FidelityParams,
  FidelityResult,
  ModerationParams,
  ModerationResult,
  ViewAngle,
} from "./gateway";
import { UPLOAD_LIMITS } from "./gateway";

// SimulatedFashionProvider — the keyless default. It performs real upload QC
// (deterministic, no network) and produces deterministic placeholder assets
// written to @ayvana/storage, so the whole generation pipeline completes end to
// end offline. Every generated asset is flagged isSimulated=true; callers must
// block publishing simulated assets in production.
export class SimulatedFashionProvider implements FashionGenerationProvider {
  readonly id: string = "simulated";
  readonly isSimulated: boolean = true;

  validateUpload(uploads: UploadDescriptor[]): ValidateUploadResult {
    const issues: UploadValidationIssue[] = [];

    if (uploads.length < UPLOAD_LIMITS.minImages) {
      issues.push({
        code: "TOO_FEW",
        message: `Upload at least ${UPLOAD_LIMITS.minImages} photos (front and back).`,
      });
    }
    if (uploads.length > UPLOAD_LIMITS.maxImages) {
      issues.push({
        code: "TOO_MANY",
        message: `Upload at most ${UPLOAD_LIMITS.maxImages} photos.`,
      });
    }

    const roles = new Set(uploads.map((u) => u.role.toUpperCase()));
    if (uploads.length >= UPLOAD_LIMITS.minImages && !roles.has("FRONT")) {
      issues.push({
        code: "MISSING_FRONT",
        message: "Include a front-facing photo of the garment.",
      });
    }

    for (const u of uploads) {
      const type = u.contentType.toLowerCase();
      if (!(UPLOAD_LIMITS.allowedTypes as readonly string[]).includes(type)) {
        issues.push({
          code: "UNSUPPORTED_TYPE",
          role: u.role,
          message: `"${u.role}" must be a JPEG, PNG, or WebP image.`,
        });
      }
      if (u.bytes > UPLOAD_LIMITS.maxBytes) {
        issues.push({
          code: "TOO_LARGE",
          role: u.role,
          message: `"${u.role}" exceeds the ${Math.round(UPLOAD_LIMITS.maxBytes / 1024 / 1024)}MB limit.`,
        });
      }
      const minDim = UPLOAD_LIMITS.minDimension;
      if (u.width != null && u.height != null && (u.width < minDim || u.height < minDim)) {
        issues.push({
          code: "LOW_RESOLUTION",
          role: u.role,
          message: `"${u.role}" is too small — use at least ${minDim}×${minDim}px for sharp results.`,
        });
      }
    }

    return { passed: issues.length === 0, issues };
  }

  async analyzeGarment(params: AnalyzeGarmentParams): Promise<AnalyzeGarmentResult> {
    // Deterministic stub analysis (schema-complete; real extraction is Phase 2).
    const seedKey = params.images[0]?.storageKey ?? "garment";
    const hue = parseInt(hash(seedKey).slice(0, 2), 16);
    return {
      status: "ok",
      analysis: {
        category: "Abaya",
        silhouette: "A-line",
        colors: [{ name: "Midnight Black", hex: "#0b0b0d", coverage: 0.9 }],
        material: "Nidha crepe",
        pattern: hue % 2 === 0 ? "Solid" : "Subtle floral",
        length: "Floor",
        sleeve: "Full",
        neckline: "Round",
        closure: "Front-open",
        buttons: { present: false, count: 0, locations: [] },
        embroidery: { present: hue % 3 === 0, locations: ["cuffs"], description: "tonal thread" },
        logo: { present: false },
        pockets: { present: false },
        belt: { present: true, style: "self-tie" },
        segmentationMasks: [],
        detailCrops: [],
        embeddings: { model: "simulated-embed", dim: 0, vectorRef: null },
        modelName: "simulated-analyzer",
      },
    };
  }

  async virtualTryOn(params: VirtualTryOnParams): Promise<VirtualTryOnResult> {
    const key = `${params.outKeyPrefix}/tryon.svg`;
    await writePlaceholderImage(key, "TRY-ON", params.garmentImages[0]?.storageKey ?? key);
    return {
      status: "ok",
      composite: {
        storageKey: key,
        width: 864,
        height: 1296,
        provider: this.id,
        providerModel: "simulated/tryon",
        isSimulated: true,
      },
    };
  }

  async generateMultiView(params: GenerateMultiViewParams): Promise<GenerateMultiViewResult> {
    const images: MultiViewImage[] = [];
    for (const angle of params.angles) {
      const key = `${params.outKeyPrefix}/${angle.toLowerCase()}.svg`;
      await writePlaceholderImage(key, angleLabel(angle), params.compositeKey + angle);
      images.push({
        storageKey: key,
        angle,
        width: 864,
        height: 1296,
        provider: this.id,
        providerModel: "simulated/multiview",
        isSimulated: true,
      });
    }
    return { status: "ok", images };
  }

  async generateVideo(params: GenerateVideoParams): Promise<GenerateVideoResult> {
    const key = `${params.outKeyPrefix}/turntable.txt`;
    // A stub "video" artifact so the full pipeline (incl. the video step) completes
    // keyless. Real frame-conditioned video is Phase 3.
    await getStorage().put({
      prefix: "video",
      key,
      contentType: "text/plain",
      body: `SIMULATED TURNTABLE\nframes=${params.frameKeys.length}\nseconds=${params.durationSec}\ncid=${params.correlationId}`,
    });
    return {
      status: "ok",
      video: {
        storageKey: `video/${key}`,
        durationSec: params.durationSec,
        provider: this.id,
        providerModel: "simulated/video",
        isSimulated: true,
      },
    };
  }

  async validateGarmentFidelity(params: FidelityParams): Promise<FidelityResult> {
    // Deterministic, always-passing scores (keyless). Real scoring is Phase 2.
    const base = 0.9 + (parseInt(hash(params.generatedKey).slice(0, 1), 16) % 10) / 200;
    return {
      status: "ok",
      garmentFidelity: round4(Math.min(base, 0.99)),
      modelConsistency: round4(Math.min(base + 0.01, 0.99)),
      imageQuality: round4(Math.min(base - 0.01, 0.99)),
      breakdown: { color: 0.95, pattern: 0.92, silhouette: 0.94, length: 0.96 },
      scorer: "simulated-fidelity",
    };
  }

  async moderateContent(_params: ModerationParams): Promise<ModerationResult> {
    return { status: "ok", allowed: true, labels: [], provider: this.id };
  }
}

async function writePlaceholderImage(key: string, label: string, seed: string): Promise<void> {
  const hue = parseInt(hash(seed).slice(0, 2), 16);
  const tag = hash(seed).slice(0, 8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="864" height="1296" viewBox="0 0 864 1296">
<rect width="864" height="1296" fill="hsl(${hue} 24% 90%)"/>
<rect x="24" y="24" width="816" height="1248" fill="none" stroke="hsl(${hue} 24% 55%)" stroke-width="4" stroke-dasharray="16 12"/>
<text x="432" y="600" font-family="sans-serif" font-size="52" fill="hsl(${hue} 24% 35%)" text-anchor="middle">SIMULATED</text>
<text x="432" y="672" font-family="sans-serif" font-size="40" fill="hsl(${hue} 24% 42%)" text-anchor="middle">${label}</text>
<text x="432" y="740" font-family="monospace" font-size="26" fill="hsl(${hue} 24% 50%)" text-anchor="middle">${tag}</text>
</svg>`;
  await getStorage().put({
    prefix: "generated",
    key,
    contentType: "image/svg+xml",
    body: svg,
  });
}

function angleLabel(a: ViewAngle): string {
  return (
    {
      IMAGE_FRONT: "FRONT",
      IMAGE_BACK: "BACK",
      IMAGE_34_FRONT: "¾ FRONT",
      IMAGE_34_BACK: "¾ BACK",
    } as Record<ViewAngle, string>
  )[a];
}

function hash(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
