import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyClerkWebhook } from "../src/webhook";

const KEY = Buffer.from("supersecretsigningkey-0123456789");
const SECRET = "whsec_" + KEY.toString("base64");

function sign(id: string, ts: string, payload: string): string {
  const sig = createHmac("sha256", KEY).update(`${id}.${ts}.${payload}`).digest("base64");
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

describe("verifyClerkWebhook", () => {
  const payload = JSON.stringify({ type: "user.created", data: { id: "user_x" } });

  it("accepts a correctly signed, fresh payload", () => {
    const ts = now();
    const headers = { svixId: "msg_1", svixTimestamp: ts, svixSignature: sign("msg_1", ts, payload) };
    expect(verifyClerkWebhook(payload, headers, SECRET)).toBe(true);
  });

  it("accepts when one of several space-separated signatures matches", () => {
    const ts = now();
    const good = sign("msg_1", ts, payload).split(",")[1];
    const headers = { svixId: "msg_1", svixTimestamp: ts, svixSignature: `v1,deadbeef v1,${good}` };
    expect(verifyClerkWebhook(payload, headers, SECRET)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const ts = now();
    const headers = { svixId: "msg_1", svixTimestamp: ts, svixSignature: sign("msg_1", ts, payload) };
    expect(verifyClerkWebhook(payload + "x", headers, SECRET)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const ts = now();
    const headers = { svixId: "msg_1", svixTimestamp: ts, svixSignature: sign("msg_1", ts, payload) };
    expect(verifyClerkWebhook(payload, headers, "whsec_" + Buffer.from("other").toString("base64"))).toBe(false);
  });

  it("rejects a stale timestamp (replay)", () => {
    const old = (Math.floor(Date.now() / 1000) - 60 * 60).toString();
    const headers = { svixId: "msg_1", svixTimestamp: old, svixSignature: sign("msg_1", old, payload) };
    expect(verifyClerkWebhook(payload, headers, SECRET)).toBe(false);
  });

  it("rejects missing headers or secret", () => {
    const ts = now();
    const sig = sign("msg_1", ts, payload);
    expect(verifyClerkWebhook(payload, { svixId: null, svixTimestamp: ts, svixSignature: sig }, SECRET)).toBe(false);
    expect(verifyClerkWebhook(payload, { svixId: "m", svixTimestamp: ts, svixSignature: sig }, undefined)).toBe(false);
  });
});
