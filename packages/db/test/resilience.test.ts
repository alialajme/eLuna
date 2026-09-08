import { describe, it, expect, vi } from "vitest";
import { withTimeout, withRetry, TimeoutError } from "../src/resilience";

describe("withTimeout", () => {
  it("resolves when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it("rejects with TimeoutError when it doesn't", async () => {
    const slow = new Promise((r) => setTimeout(r, 50));
    await expect(withTimeout(slow, 5, "provider")).rejects.toBeInstanceOf(TimeoutError);
  });

  it("propagates the underlying rejection", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
  });
});

describe("withRetry", () => {
  const noSleep = () => Promise.resolve();

  it("returns on first success without retrying", async () => {
    const fn = vi.fn(async () => "ok");
    expect(await withRetry(fn, { sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries up to `retries` then succeeds", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n < 3) throw new Error("transient");
      return "ok";
    });
    expect(await withRetry(fn, { retries: 3, sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after exhausting retries", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always");
    });
    await expect(withRetry(fn, { retries: 2, sleep: noSleep })).rejects.toThrow("always");
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("does not retry when shouldRetry returns false", async () => {
    const fn = vi.fn(async () => {
      throw new Error("fatal");
    });
    await expect(
      withRetry(fn, { retries: 5, sleep: noSleep, shouldRetry: () => false }),
    ).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("applies bounded jittered backoff via injected sleep/random", async () => {
    const delays: number[] = [];
    let n = 0;
    const fn = async () => {
      if (++n < 3) throw new Error("t");
      return "ok";
    };
    await withRetry(fn, {
      retries: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      random: () => 1, // full backoff
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    // attempt 0 -> 100*2^0=100, attempt 1 -> 200
    expect(delays).toEqual([100, 200]);
  });
});
