import { describe, it, expect } from "vitest";
import { createInMemoryRateLimiter, rateLimitOr429 } from "../src/ratelimit";

describe("in-memory rate limiter", () => {
  it("allows up to `max` per window then blocks", async () => {
    let clock = 1_000_000;
    const rl = createInMemoryRateLimiter({ windowMs: 1000, max: 3, now: () => clock });

    expect((await rl.limit("a")).success).toBe(true);
    expect((await rl.limit("a")).success).toBe(true);
    const third = await rl.limit("a");
    expect(third.success).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = await rl.limit("a");
    expect(fourth.success).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("isolates keys", async () => {
    let clock = 0;
    const rl = createInMemoryRateLimiter({ windowMs: 1000, max: 1, now: () => clock });
    expect((await rl.limit("a")).success).toBe(true);
    expect((await rl.limit("b")).success).toBe(true); // different key, own budget
    expect((await rl.limit("a")).success).toBe(false);
  });

  it("resets after the window slides past old hits", async () => {
    let clock = 0;
    const rl = createInMemoryRateLimiter({ windowMs: 1000, max: 2, now: () => clock });
    expect((await rl.limit("a")).success).toBe(true);
    expect((await rl.limit("a")).success).toBe(true);
    expect((await rl.limit("a")).success).toBe(false);
    clock += 1001; // window elapses
    expect((await rl.limit("a")).success).toBe(true);
  });

  it("rateLimitOr429 returns null under limit and a 429 Response over it", async () => {
    let clock = 0;
    const rl = createInMemoryRateLimiter({ windowMs: 1000, max: 1, now: () => clock });
    expect(await rateLimitOr429(rl, "a")).toBeNull();
    const res = await rateLimitOr429(rl, "a");
    expect(res).toBeInstanceOf(Response);
    expect(res!.status).toBe(429);
    expect(res!.headers.get("retry-after")).toBeTruthy();
  });

  it("fails open if the limiter throws", async () => {
    const broken = {
      limit: async () => {
        throw new Error("backend down");
      },
    };
    expect(await rateLimitOr429(broken, "a")).toBeNull();
  });
});
