import { describe, it, expect } from "vitest";
import {
  createInMemoryRateLimiter,
  createRedisRateLimiter,
  rateLimitOr429,
  type RedisLike,
} from "../src/ratelimit";

// In-memory fake of the RedisLike surface (atomic INCR semantics) for testing the
// distributed limiter's logic without a real Redis.
function fakeRedis(): RedisLike & { store: Map<string, number>; expires: string[] } {
  const store = new Map<string, number>();
  const expires: string[] = [];
  return {
    store,
    expires,
    async incr(key: string) {
      const v = (store.get(key) ?? 0) + 1;
      store.set(key, v);
      return v;
    },
    async pexpire(key: string) {
      expires.push(key);
      return 1;
    },
  };
}

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

describe("Redis rate limiter (fixed window)", () => {
  it("allows up to max then blocks within a window", async () => {
    const redis = fakeRedis();
    let clock = 1_000_000;
    const rl = createRedisRateLimiter(redis, { windowMs: 1000, max: 3, now: () => clock });
    expect((await rl.limit("u1")).success).toBe(true);
    expect((await rl.limit("u1")).success).toBe(true);
    expect((await rl.limit("u1")).success).toBe(true);
    const blocked = await rl.limit("u1");
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("sets TTL only on the first increment of a window", async () => {
    const redis = fakeRedis();
    let clock = 0;
    const rl = createRedisRateLimiter(redis, { windowMs: 1000, max: 5, now: () => clock });
    await rl.limit("u1");
    await rl.limit("u1");
    expect(redis.expires).toHaveLength(1); // pexpire called once
  });

  it("starts a fresh count in the next window", async () => {
    const redis = fakeRedis();
    let clock = 0;
    const rl = createRedisRateLimiter(redis, { windowMs: 1000, max: 1, now: () => clock });
    expect((await rl.limit("u1")).success).toBe(true);
    expect((await rl.limit("u1")).success).toBe(false);
    clock += 1000; // next window index → new key
    expect((await rl.limit("u1")).success).toBe(true);
  });

  it("counts each key in a shared store (cross-instance semantics)", async () => {
    const redis = fakeRedis(); // one store == one Redis shared by all instances
    let clock = 0;
    const a = createRedisRateLimiter(redis, { windowMs: 1000, max: 2, now: () => clock });
    const b = createRedisRateLimiter(redis, { windowMs: 1000, max: 2, now: () => clock });
    expect((await a.limit("u1")).success).toBe(true); // instance A
    expect((await b.limit("u1")).success).toBe(true); // instance B, same counter
    expect((await a.limit("u1")).success).toBe(false); // 3rd across instances → blocked
  });
});
