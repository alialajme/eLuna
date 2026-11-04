import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Stripe from "stripe";
import { StripeGateway } from "../src/stripe";

// All offline: the Stripe client needs no network to construct, and both
// constructEvent (HMAC verify) and generateTestHeaderString are local crypto.
describe("Stripe webhook signature validation", () => {
  const saved: Record<string, string | undefined> = {};
  const SECRET = "whsec_test_abc123";

  beforeEach(() => {
    saved.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    saved.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const succeededPayload = JSON.stringify({
    id: "evt_1",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_123", metadata: { orderId: "order_abc" } } },
  });

  it("REJECTS a forged/invalid signature (no event is processed)", async () => {
    const gw = new StripeGateway();
    await expect(gw.handleWebhook(succeededPayload, "t=1,v1=forged")).rejects.toThrow();
  });

  it("REJECTS a body tampered after signing", async () => {
    const sig = Stripe.webhooks.generateTestHeaderString({ payload: succeededPayload, secret: SECRET });
    const tampered = succeededPayload.replace("order_abc", "order_HACKED");
    const gw = new StripeGateway();
    await expect(gw.handleWebhook(tampered, sig)).rejects.toThrow();
  });

  it("ACCEPTS a correctly-signed payment_intent.succeeded and maps it", async () => {
    const sig = Stripe.webhooks.generateTestHeaderString({ payload: succeededPayload, secret: SECRET });
    const gw = new StripeGateway();
    const res = await gw.handleWebhook(succeededPayload, sig);
    expect(res).toEqual({ kind: "payment_succeeded", orderId: "order_abc", externalRef: "pi_123" });
  });

  it("maps a correctly-signed payment_intent.payment_failed", async () => {
    const payload = JSON.stringify({
      id: "evt_2",
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_456", metadata: { orderId: "order_xyz" } } },
    });
    const sig = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const res = await new StripeGateway().handleWebhook(payload, sig);
    expect(res).toEqual({ kind: "payment_failed", orderId: "order_xyz", externalRef: "pi_456" });
  });

  it("fails closed when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const gw = new StripeGateway();
    await expect(gw.handleWebhook(succeededPayload, "sig")).rejects.toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});
