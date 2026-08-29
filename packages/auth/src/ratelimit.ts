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
