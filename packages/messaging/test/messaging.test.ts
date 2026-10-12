import { describe, it, expect } from "vitest";
import { getMessagingGateway, SimulatedMessaging } from "../src";

describe("messaging gateway (keyless)", () => {
  it("factory returns SimulatedMessaging when WhatsApp is not configured", () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_API_TOKEN;
    expect(getMessagingGateway()).toBeInstanceOf(SimulatedMessaging);
  });

  it("SimulatedMessaging.sendMessage returns a synthetic ref and never throws", async () => {
    const res = await new SimulatedMessaging().sendMessage({ phone: "+971500000000", text: "hi" });
    expect(res.sent).toBe(true);
    if (res.sent) expect(res.externalRef).toMatch(/^sim_/);
  });

  it("parseWebhook extracts an inbound message from the simulated payload", () => {
    const body = JSON.stringify({ from: "+971500000000", text: "help", id: "wamid.1" });
    const parsed = new SimulatedMessaging().parseWebhook(body);
    expect(parsed).toEqual({ kind: "message", from: "+971500000000", text: "help", externalRef: "wamid.1" });
  });
});
