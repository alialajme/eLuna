// Config-gated real-provider SCAFFOLDS. Phase 1 ships these as author-complete
// but non-calling: each is only instantiated by the factory when its hasX() gate
// is true, and the op it owns returns a `failed` result with a TODO(operator)
// marker until wired. Operations a given provider does NOT own delegate to the
// SimulatedFashionProvider so a partially-configured stack still completes the
// pipeline rather than producing invalid output.
//
// Per the Phase 0 ADR §6 the recommended combination is:
//   - try-on:     FASHN v1.6            (via fal/Replicate)
//   - multi-view: FLUX.2               (via fal/BFL)
//   - video:      Veo 3.1 (Kling fb)   (via Gemini/Replicate/fal)
//
// See docs/ai-studio/phase-1-implementation.md for activation steps.

import type {
  FashionGenerationProvider,
  VirtualTryOnParams,
  VirtualTryOnResult,
  GenerateMultiViewParams,
  GenerateMultiViewResult,
  GenerateVideoParams,
  GenerateVideoResult,
} from "./gateway";
import { SimulatedFashionProvider } from "./simulated";

/** Shared base: delegate the full interface to Simulated, override only the owned op. */
abstract class ScaffoldProvider extends SimulatedFashionProvider {
  // Scaffolds are NOT simulated output — but until wired they produce nothing,
  // so publishing is impossible anyway. Keep isSimulated=false so a wired-but-
  // incomplete prod deploy is forced to fail loudly rather than publish stubs.
  override readonly isSimulated = false;
}

export class FashnProvider extends ScaffoldProvider {
  override readonly id = "fashn";

  override async virtualTryOn(params: VirtualTryOnParams): Promise<VirtualTryOnResult> {
    // TODO(operator): POST garment + model refs to FASHN v1.6 (or via fal), poll
    // the job, download the composite, put() it to storage, return the key.
    void params;
    return { status: "failed", error: "FashnProvider.virtualTryOn not implemented (operator activation required)" };
  }
}

export class FluxProvider extends ScaffoldProvider {
  override readonly id = "flux2";

  override async generateMultiView(params: GenerateMultiViewParams): Promise<GenerateMultiViewResult> {
    // TODO(operator): call FLUX.2 with the try-on composite + model reference set
    // + a fixed seed so only camera/pose vary across the 4 angles; store each.
    void params;
    return { status: "failed", error: "FluxProvider.generateMultiView not implemented (operator activation required)" };
  }
}

export class VeoProvider extends ScaffoldProvider {
  override readonly id = "veo3";

  override async generateVideo(params: GenerateVideoParams): Promise<GenerateVideoResult> {
    // TODO(operator): call Veo 3.1 Reference-to-Video conditioned on the 4
    // generated frames (not text-only); download the clip; store it.
    void params;
    return { status: "failed", error: "VeoProvider.generateVideo not implemented (operator activation required)" };
  }
}

export type { FashionGenerationProvider };
