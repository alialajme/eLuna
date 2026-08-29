// Reliability primitives for external/provider calls (§24). Keep timeouts and
// retries EXPLICIT at the boundary — a hung provider must not hang a checkout,
// and retries must be bounded and only applied to idempotent operations.

export class TimeoutError extends Error {
  constructor(ms: number, label?: string) {
    super(`Operation${label ? ` "${label}"` : ""} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Reject if `promise` does not settle within `ms`. Note: this does not cancel
 * the underlying work (JS promises aren't cancellable) — it bounds how long the
 * caller waits, so a slow provider can't stall the request indefinitely.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms, label)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export type RetryOptions = {
  /** number of RETRIES after the first attempt (so total attempts = retries + 1) */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** decide whether an error is retryable (default: retry all) */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  /** injectable for tests */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `fn` with bounded exponential backoff + full jitter. Only use for
 * IDEMPOTENT operations — retrying a non-idempotent charge could double-charge.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 100;
  const max = opts.maxDelayMs ?? 2000;
  const shouldRetry = opts.shouldRetry ?? (() => true);
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err, attempt)) break;
      const backoff = Math.min(max, base * 2 ** attempt);
      const delay = Math.floor(random() * backoff); // full jitter
      opts.onRetry?.(err, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}
