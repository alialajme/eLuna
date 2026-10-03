import type { FashionGenerationProvider, FashionOperation } from "./gateway";
import { SimulatedFashionProvider } from "./simulated";
import { FashnProvider, FluxProvider, VeoProvider } from "./adapters";
import { hasFashn, hasFlux, hasVeo } from "./config";

/**
 * Resolve the provider for a generation operation. Never throws. With no keys,
 * every op resolves to SimulatedFashionProvider so the whole pipeline runs
 * keyless end-to-end. A configured op resolves to its real-provider scaffold
 * (defense-in-depth alongside the server-side fashionAvailable() gate).
 *
 * Per the Phase 0 ADR the recommended combination uses a different provider per
 * operation (FASHN try-on / FLUX.2 multi-view / Veo video); analyze, fidelity
 * and moderation stay on the Simulated/Claude+CV path this phase.
 */
export function getFashionProvider(op: FashionOperation): FashionGenerationProvider {
  switch (op) {
    case "TRYON":
      return hasFashn() ? new FashnProvider() : new SimulatedFashionProvider();
    case "MULTIVIEW":
      return hasFlux() ? new FluxProvider() : new SimulatedFashionProvider();
    case "VIDEO":
      return hasVeo() ? new VeoProvider() : new SimulatedFashionProvider();
    case "ANALYZE":
    case "FIDELITY":
    case "MODERATION":
    default:
      return new SimulatedFashionProvider();
  }
}
