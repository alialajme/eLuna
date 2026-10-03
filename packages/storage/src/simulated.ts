import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import type {
  StorageGateway,
  SignedUploadParams,
  SignedUploadResult,
  PutParams,
  PutResult,
  SignedReadParams,
  SignedReadResult,
  StoragePrefix,
} from "./gateway";
import { buildKey, prefixOf } from "./gateway";
import { simulatedStorageRoot } from "./config";

// SimulatedStorage — the no-keys default. Keeps bytes on local disk under a
// temp root and hands back file:// read URLs; if disk is unavailable it keeps
// bytes in memory and returns `data:` URIs (mirrors the Phase 5 base64 path so
// dev is unchanged). It NEVER throws from the factory path and runs fully
// offline, so the whole generation pipeline completes keyless.
//
// Because there is no real signed-URL endpoint offline, `signedUpload` returns a
// loopback URL pointing at the Studio upload API (which performs the actual
// write via `put`). The contract (key + headers) is identical to the real
// adapter, so callers don't branch on environment.
export class SimulatedStorage implements StorageGateway {
  private readonly mem = new Map<string, { contentType: string; body: Buffer; at: number }>();
  private readonly root: string;
  private diskOk = true;

  constructor(root?: string) {
    this.root = root || simulatedStorageRoot() || join(tmpdir(), "ayvana-studio-storage");
  }

  private pathFor(key: string): string {
    return join(this.root, key);
  }

  async signedUpload(params: SignedUploadParams): Promise<SignedUploadResult> {
    const key = buildKey(params.prefix, params.key);
    // Loopback: the keyless upload API accepts the bytes and calls put().
    const url = `/api/v1/ai-studio/uploads/put?key=${encodeURIComponent(key)}`;
    return {
      status: "ok",
      key,
      url,
      headers: { "content-type": params.contentType, "x-max-bytes": String(params.maxBytes) },
    };
  }

  async put(params: PutParams): Promise<PutResult> {
    const key = buildKey(params.prefix, params.key);
    const body =
      typeof params.body === "string"
        ? Buffer.from(params.body)
        : Buffer.from(params.body as Uint8Array);
    if (this.diskOk) {
      try {
        const p = this.pathFor(key);
        await fs.mkdir(dirname(p), { recursive: true });
        await fs.writeFile(p, body);
        await fs.writeFile(`${p}.meta`, params.contentType);
        return { status: "ok", key };
      } catch {
        // Disk unavailable (read-only FS / sandbox) — degrade to memory.
        this.diskOk = false;
      }
    }
    this.mem.set(key, { contentType: params.contentType, body, at: Date.now() });
    return { status: "ok", key };
  }

  async getSignedUrl(params: SignedReadParams): Promise<SignedReadResult> {
    const key = params.key;
    // In-memory → data URI.
    const memHit = this.mem.get(key);
    if (memHit) {
      return { status: "ok", url: `data:${memHit.contentType};base64,${memHit.body.toString("base64")}` };
    }
    if (this.diskOk) {
      try {
        const p = this.pathFor(key);
        await fs.access(p);
        // A file:// URL is a stable, local, "signed" stand-in offline.
        return { status: "ok", url: `file://${p}` };
      } catch {
        // fall through
      }
    }
    // Deterministic placeholder so previews never 404 in the keyless pipeline.
    const tag = createHash("sha1").update(key).digest("hex").slice(0, 8);
    return { status: "ok", url: placeholderDataUri(prefixOf(key), tag) };
  }

  async delete(key: string): Promise<void> {
    this.mem.delete(key);
    if (this.diskOk) {
      try {
        const p = this.pathFor(key);
        await fs.rm(p, { force: true });
        await fs.rm(`${p}.meta`, { force: true });
      } catch {
        /* best-effort */
      }
    }
  }

  async purgePrefix(prefix: StoragePrefix, olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let n = 0;
    for (const [key, v] of this.mem) {
      if (key.startsWith(`${prefix}/`) && v.at < cutoff) {
        this.mem.delete(key);
        n++;
      }
    }
    if (this.diskOk) {
      try {
        const dir = join(this.root, prefix);
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const e of entries) {
          if (e.isFile() && e.name.endsWith(".meta")) continue;
          const p = join(dir, e.name);
          const st = await fs.stat(p).catch(() => null);
          if (st && st.mtimeMs < cutoff) {
            await fs.rm(p, { force: true });
            await fs.rm(`${p}.meta`, { force: true });
            n++;
          }
        }
      } catch {
        /* best-effort */
      }
    }
    return n;
  }
}

/** A tiny deterministic SVG placeholder as a data URI (keyless preview). */
function placeholderDataUri(prefix: StoragePrefix, tag: string): string {
  const label = prefix === "video" ? "SIMULATED VIDEO" : "SIMULATED";
  const hue = parseInt(tag.slice(0, 2), 16);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="864" height="1296" viewBox="0 0 864 1296">
<rect width="864" height="1296" fill="hsl(${hue} 30% 92%)"/>
<rect x="24" y="24" width="816" height="1248" fill="none" stroke="hsl(${hue} 30% 60%)" stroke-width="4" stroke-dasharray="16 12"/>
<text x="432" y="640" font-family="sans-serif" font-size="56" fill="hsl(${hue} 30% 40%)" text-anchor="middle">${label}</text>
<text x="432" y="710" font-family="monospace" font-size="28" fill="hsl(${hue} 30% 50%)" text-anchor="middle">${tag}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
