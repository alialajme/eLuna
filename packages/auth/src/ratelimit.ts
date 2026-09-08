// Application-level rate limiting.
//
// The RateLimiter interface is storage-agnostic so the in-memory limiter (fine
// for a single instance / dev) can be swapped for a Redis-backed one in a
// horizontally-scaled production deployment WITHOUT changing call sites. Azure
// Front Door / WAF should sit in front as an additional outer layer. See
// docs/PRODUCTION-HARDENING.md §19.

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  /** epoch ms when the current window resets */
  reset: number;
};

export interface RateLimiter {
  limit(key: string): Promise<RateLimitResult>;
}

export type InMemoryRateLimiterOptions = {
  /** window length in ms */
  windowMs: number;
  /** max requests allowed per key per window */
  max: number;
  /** clock, injectable for tests */
  now?: () => number;
};

/**
 * Sliding-window in-memory limiter. Per-process only — two app replicas each get
 * their own budget, so this is a floor, not a ceiling. Use a Redis-backed
 * implementation of RateLimiter for authoritative limits across instances.
 */
export function createInMemoryRateLimiter(opts: InMemoryRateLimiterOptions): RateLimiter {
  const { windowMs, max } = opts;
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();

  return {
    async limit(key: string): Promise<RateLimitResult> {
      const t = now();
      const windowStart = t - windowMs;
      const arr = (hits.get(key) ?? []).filter((ts) => ts > windowStart);

      if (arr.length >= max) {
        hits.set(key, arr);
        const oldest = arr[0] ?? t;
        return { success: false, remaining: 0, reset: oldest + windowMs };
      }

      arr.push(t);
      hits.set(key, arr);

      // Opportunistic cleanup so the map doesn't grow unbounded.
      if (hits.size > 10_000) {
        for (const [k, v] of hits) {
          const kept = v.filter((ts) => ts > windowStart);
          if (kept.length === 0) hits.delete(k);
          else hits.set(k, kept);
        }
      }

      return { success: true, remaining: max - arr.length, reset: t + windowMs };
    },
  };
}

/**
 * Minimal Redis surface the distributed limiter needs. `ioredis` and `node-redis`
 * both satisfy this, so we don't hard-depend on a specific client.
 */
export interface RedisLike {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
}

export type RedisRateLimiterOptions = {
  windowMs: number;
  max: number;
  /** key namespace prefix */
  prefix?: string;
  now?: () => number;
};

/**
 * Distributed fixed-window limiter backed by Redis. Correct across app replicas
 * because `INCR` is atomic server-side: all instances increment the same
 * per-window counter. The first increment in a window sets the TTL. Use this in
 * production (multi-replica) instead of the in-memory limiter.
 */
export function createRedisRateLimiter(redis: RedisLike, opts: RedisRateLimiterOptions): RateLimiter {
  const { windowMs, max } = opts;
  const prefix = opts.prefix ?? "ratelimit";
  const now = opts.now ?? Date.now;

  return {
    async limit(key: string): Promise<RateLimitResult> {
      const t = now();
      const windowIndex = Math.floor(t / windowMs);
      const redisKey = `${prefix}:${key}:${windowIndex}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.pexpire(redisKey, windowMs);
      const reset = (windowIndex + 1) * windowMs;
      return { success: count <= max, remaining: Math.max(0, max - count), reset };
    },
  };
}

// Process-wide limiter for the AI endpoints. Redis-backed when REDIS_URL is set
// (authoritative across replicas), else the in-memory floor. Built once, lazily,
// so ioredis is only loaded when actually configured.
let aiLimiter: Promise<RateLimiter> | undefined;

export function getAiRateLimiter(): Promise<RateLimiter> {
  if (!aiLimiter) aiLimiter = buildAiLimiter();
  return aiLimiter;
}

async function buildAiLimiter(): Promise<RateLimiter> {
  const url = process.env.REDIS_URL;
  const windowMs = 60_000;
  const max = 20;
  if (!url) return createInMemoryRateLimiter({ windowMs, max });
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url);
    return createRedisRateLimiter(client as unknown as RedisLike, { windowMs, max, prefix: "ai" });
  } catch (e) {
    console.error("[ratelimit] Redis init failed, falling back to in-memory", e);
    return createInMemoryRateLimiter({ windowMs, max });
  }
}

/**
 * Enforce a limit and, if exceeded, return a ready-to-send 429 Response;
 * otherwise return null so the caller proceeds. Fails OPEN (returns null) if the
 * limiter itself errors — availability over strictness for non-critical paths.
 */
export async function rateLimitOr429(limiter: RateLimiter, key: string): Promise<Response | null> {
  let result: RateLimitResult;
  try {
    result = await limiter.limit(key);
  } catch {
    return null;
  }
  if (result.success) return null;
  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfter) },
  });
}
