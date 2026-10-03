// Object-storage gateway for the AI Fashion Studio.
//
// Mirrors the repo's credential-gated gateway pattern (payments/courier/einvoice):
// interface → SimulatedStorage (no-keys default, builds + runs offline) →
// config-gated AzureBlobStorage scaffold → factory that never throws.
//
// The DB stores only `storageKey`s, never bytes. Keys are namespaced by a
// `StoragePrefix` so retention/lifecycle policies can target raw uploads vs
// published assets independently.

/** Logical namespaces; map to containers/prefixes in the real adapter. */
export type StoragePrefix = "original" | "generated" | "thumb" | "video" | "temp";

export type SignedUploadParams = {
  prefix: StoragePrefix;
  /** Opaque, caller-chosen suffix (e.g. `${garmentId}/front.jpg`). */
  key: string;
  contentType: string;
  /** Hard cap enforced by the signed URL (bytes). */
  maxBytes: number;
};

export type SignedUploadResult =
  | { status: "ok"; key: string; url: string; headers: Record<string, string> }
  | { status: "failed"; error: string };

export type PutParams = {
  prefix: StoragePrefix;
  key: string;
  contentType: string;
  /** Raw bytes (server-side put, e.g. a generated asset written by the worker). */
  body: Buffer | Uint8Array | string;
};

export type PutResult = { status: "ok"; key: string } | { status: "failed"; error: string };

export type SignedReadParams = {
  key: string;
  /** Short-lived read URL TTL (seconds). */
  ttlSeconds: number;
};

export type SignedReadResult = { status: "ok"; url: string } | { status: "failed"; error: string };

export interface StorageGateway {
  /** Return a signed URL the browser PUTs bytes to (never proxied through our server). */
  signedUpload(params: SignedUploadParams): Promise<SignedUploadResult>;
  /** Server-side write of bytes we already hold (worker-generated assets). */
  put(params: PutParams): Promise<PutResult>;
  /** Short-TTL, per-asset read URL for protected previews. */
  getSignedUrl(params: SignedReadParams): Promise<SignedReadResult>;
  /** Delete a single object (retention hook for temp uploads). */
  delete(key: string): Promise<void>;
  /** Bulk retention sweep for a prefix older than `olderThanMs`. Returns #deleted. */
  purgePrefix(prefix: StoragePrefix, olderThanMs: number): Promise<number>;
}

/** Build a namespaced storage key. */
export function buildKey(prefix: StoragePrefix, suffix: string): string {
  const clean = suffix.replace(/^\/+/, "");
  return `${prefix}/${clean}`;
}

/** Recover the prefix from a key (best-effort; defaults to "temp"). */
export function prefixOf(key: string): StoragePrefix {
  const head = key.split("/", 1)[0];
  const known: StoragePrefix[] = ["original", "generated", "thumb", "video", "temp"];
  return (known as string[]).includes(head ?? "") ? (head as StoragePrefix) : "temp";
}
