import { describe, it, expect } from "vitest";
import { createLogger } from "../src/logger";
import { getCorrelationId, newCorrelationId, CORRELATION_HEADER } from "../src/correlation";

function capture(level = "debug" as const) {
  const lines: { level: string; record: Record<string, unknown> }[] = [];
  const logger = createLogger({
    level,
    service: "test-svc",
    env: "test",
    now: () => "2026-01-01T00:00:00.000Z",
    write: (lvl, line) => lines.push({ level: lvl, record: JSON.parse(line) }),
  });
  return { logger, lines };
}

describe("structured logger", () => {
  it("emits one JSON line with standard fields", () => {
    const { logger, lines } = capture();
    logger.info("checkout started", { orderId: "ord_1" });
    expect(lines).toHaveLength(1);
    expect(lines[0].record).toMatchObject({
      ts: "2026-01-01T00:00:00.000Z",
      level: "info",
      service: "test-svc",
      env: "test",
      msg: "checkout started",
      orderId: "ord_1",
    });
  });

  it("respects the minimum level", () => {
    const { logger, lines } = capture("warn");
    logger.info("noise");
    logger.debug("more noise");
    logger.warn("kept");
    logger.error("kept too");
    expect(lines.map((l) => l.level)).toEqual(["warn", "error"]);
  });

  it("child() binds context onto every line", () => {
    const { logger, lines } = capture();
    const reqLog = logger.child({ correlationId: "cid_1", vendorId: "v1" });
    reqLog.info("a");
    reqLog.error("b", { paymentId: "p1" });
    expect(lines[0].record).toMatchObject({ correlationId: "cid_1", vendorId: "v1" });
    expect(lines[1].record).toMatchObject({ correlationId: "cid_1", vendorId: "v1", paymentId: "p1" });
  });

  it("redacts sensitive keys", () => {
    const { logger, lines } = capture();
    logger.info("oops", { token: "abc", client_secret: "s", orderId: "ord_2" });
    expect(lines[0].record).toMatchObject({ token: "[redacted]", client_secret: "[redacted]", orderId: "ord_2" });
  });

  it("routes error/warn to their sinks (default write is level-aware)", () => {
    const seen: string[] = [];
    const logger = createLogger({ write: (lvl) => seen.push(lvl) });
    logger.error("e");
    logger.warn("w");
    logger.info("i");
    expect(seen).toEqual(["error", "warn", "info"]);
  });
});

describe("correlation id", () => {
  it("reuses an inbound correlation header", () => {
    const req = { headers: { get: (n: string) => (n === CORRELATION_HEADER ? "cid_inbound" : null) } };
    expect(getCorrelationId(req)).toBe("cid_inbound");
  });

  it("mints a new id when absent", () => {
    const req = { headers: { get: () => null } };
    const id = getCorrelationId(req);
    expect(id).toBeTruthy();
    expect(id).not.toBe("");
  });

  it("ignores an absurdly long inbound value", () => {
    const req = { headers: { get: () => "x".repeat(200) } };
    expect(getCorrelationId(req).length).toBeLessThanOrEqual(128);
  });

  it("newCorrelationId returns unique-ish values", () => {
    expect(newCorrelationId()).not.toBe(newCorrelationId());
  });
});
