import { createHmac, timingSafeEqual } from "crypto";

export type SvixHeaders = {
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
};

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Clerk (svix) webhook signature without pulling in the `svix` package.
 *
 * svix signs `${id}.${timestamp}.${body}` with HMAC-SHA256 using the key bytes
 * decoded from the `whsec_`-prefixed secret, base64-encodes the result, and sends
 * it in the `svix-signature` header as a space-separated list of `v<version>,<sig>`
 * entries. We recompute and timing-safe compare against each, and reject stale
 * timestamps to blunt replay.
 */
export function verifyClerkWebhook(
  payload: string,
  headers: SvixHeaders,
  secret: string | undefined,
): boolean {
  const { svixId, svixTimestamp, svixSignature } = headers;
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;

  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) {
    return false;
  }

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest();

  // Header: "v1,<b64> v1,<b64> …" — the part after the comma is the base64 signature.
  const provided = svixSignature
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter((s): s is string => Boolean(s));

  return provided.some((sig) => {
    const sigBytes = Buffer.from(sig, "base64");
    return sigBytes.length === expected.length && timingSafeEqual(sigBytes, expected);
  });
}
