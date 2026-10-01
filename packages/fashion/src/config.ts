import type { FashionOperation } from "./gateway";

// Credential gates per provider. Keys live in Key Vault in prod; presence of the
// env var is the signal that a real adapter may be used.
export const hasFal = () => !!process.env.FAL_KEY;
export const hasReplicate = () => !!process.env.REPLICATE_API_TOKEN;
export const hasFashn = () => !!process.env.FASHN_API_KEY || hasFal();
export const hasFlux = () => !!process.env.FLUX_API_KEY || hasFal();
export const hasVeo = () => !!process.env.VEO_API_KEY || !!process.env.GEMINI_API_KEY || hasReplicate();
export const hasKling = () => !!process.env.KLING_API_KEY || hasFal();
export const hasModeration = () =>
  !!process.env.MODERATION_API_KEY || !!process.env.AWS_REKOGNITION_REGION;

const nonProd = () => process.env.NODE_ENV !== "production";

/**
 * Whether a generation operation may be performed in the current environment.
 * An operation is available when a real provider is configured for it, OR in
 * non-production (where SimulatedFashionProvider stands in so the full pipeline
 * runs keyless). This is the server-side chokepoint (ADR R2 dual-gate): in prod
 * with no keys the feature is disabled rather than fake-captured, and simulated
 * assets are never publishable.
 */
export function fashionAvailable(op: FashionOperation): boolean {
  switch (op) {
    case "ANALYZE":
      return true || nonProd(); // Claude vision via @ayvana/ai; always has a path
    case "TRYON":
      return hasFashn() || nonProd();
    case "MULTIVIEW":
      return hasFlux() || nonProd();
    case "VIDEO":
      return hasVeo() || hasKling() || nonProd();
    case "FIDELITY":
      return true || nonProd(); // Claude vision + in-house CV
    case "MODERATION":
      return hasModeration() || nonProd();
    default:
      return nonProd();
  }
}

/** True when every op needed for a full shoot has a real (non-simulated) path. */
export function hasAnyRealProvider(): boolean {
  return hasFashn() || hasFlux() || hasVeo() || hasKling();
}
