import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getMessagingGateway, SimulatedMessaging, WhatsappGateway } from "../src";

const WA_KEYS = ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_API_TOKEN"];

describe("messaging gateway contract", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of WA_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of WA_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  describe("factory selection", () => {
    it("never throws; no creds → SimulatedMessaging", () => {
      expect(getMessagingGateway()).toBeInstanceOf(SimulatedMessaging);
    });
    it("partial creds still fall back to Simulated", () => {
      process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
      expect(getMessagingGateway()).toBeInstanceOf(SimulatedMessaging);
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      process.env.WHATSAPP_API_TOKEN = "tok";
      expect(getMessagingGateway()).toBeInstanceOf(SimulatedMessaging);
    });
    it("both creds → WhatsappGateway", () => {
      process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
      process.env.WHATSAPP_API_TOKEN = "tok";
      expect(getMessagingGateway()).toBeInstanceOf(WhatsappGateway);
    });
  });

  describe("SimulatedMessaging", () => {
    it("sendMessage reports sent with a ref (no network)", async () => {
      const r = await new SimulatedMessaging().sendMessage({ phone: "+971500000000", text: "hi" });
      expect(r.sent).toBe(true);
      if (r.sent) expect(typeof r.externalRef).toBe("string");
    });

    it("parseWebhook maps a well-formed inbound payload to a message", () => {
      const ev = new SimulatedMessaging().parseWebhook(
        JSON.stringify({ from: "+971500000000", text: "hello", id: "wamid.1" }),
      );
      expect(ev).toEqual({ kind: "message", from: "+971500000000", text: "hello", externalRef: "wamid.1" });
    });

    it("parseWebhook ignores malformed JSON and missing fields", () => {
      expect(new SimulatedMessaging().parseWebhook("not json")).toEqual({ kind: "ignored" });
      expect(new SimulatedMessaging().parseWebhook(JSON.stringify({ from: "+9715" }))).toEqual({ kind: "ignored" });
      expect(new SimulatedMessaging().parseWebhook(JSON.stringify({ text: "no sender" }))).toEqual({ kind: "ignored" });
    });
  });

  describe("WhatsappGateway.parseWebhook (pure — no network)", () => {
    // The real Meta webhook shape: entry[].changes[].value.messages[].
    it("extracts sender/text/id and prefixes the sender with +", () => {
      const body = JSON.stringify({
        entry: [{ changes: [{ value: { messages: [{ from: "971500000000", text: { body: "hi" }, id: "wamid.9" }] } }] }],
      });
      const ev = new WhatsappGateway().parseWebhook(body);
      expect(ev).toEqual({ kind: "message", from: "+971500000000", text: "hi", externalRef: "wamid.9" });
    });

    it("ignores status-only / malformed events", () => {
      expect(new WhatsappGateway().parseWebhook("{}")).toEqual({ kind: "ignored" });
      expect(new WhatsappGateway().parseWebhook("nope")).toEqual({ kind: "ignored" });
      // a delivery-status callback has no messages[].text.body
      const statusOnly = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] });
      expect(new WhatsappGateway().parseWebhook(statusOnly)).toEqual({ kind: "ignored" });
    });
  });
});
