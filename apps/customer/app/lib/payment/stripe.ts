import Stripe from "stripe";
import { stripeConfig } from "./config";
import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
  WebhookResult,
} from "./gateway";

export class StripeGateway implements PaymentGateway {
  private client = new Stripe(stripeConfig().secret);

  async createPayment(p: CreatePaymentParams): Promise<CreatePaymentResult> {
    try {
      const intent = await this.client.paymentIntents.create({
        amount: Math.round(p.amount * 100), // AED → fils
        currency: p.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true }, // surfaces Apple/Google Pay + cards
        description: p.description,
        receipt_email: p.customerEmail || undefined,
        metadata: { orderId: p.orderId, ...(p.metadata ?? {}) },
      });
      if (!intent.client_secret) return { status: "failed", error: "No client secret returned" };
      return { status: "requires_action", externalRef: intent.id, clientSecret: intent.client_secret };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : "Stripe error" };
    }
  }

  async refund(p: RefundParams): Promise<RefundResult> {
    try {
      await this.client.refunds.create({
        payment_intent: p.externalRef,
        amount: Math.round(p.amount * 100),
        reason: "requested_by_customer",
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Refund failed" };
    }
  }

  async handleWebhook(rawBody: string, signature: string): Promise<WebhookResult> {
    const { webhookSecret } = stripeConfig();
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    const event = this.client.webhooks.constructEvent(rawBody, signature, webhookSecret); // throws on bad sig
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      return { kind: "payment_succeeded", orderId: pi.metadata.orderId ?? "", externalRef: pi.id };
    }
    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      return { kind: "payment_failed", orderId: pi.metadata.orderId ?? "", externalRef: pi.id };
    }
    return { kind: "ignored" };
  }

  /** Server-side reconciliation used by syncOrderPayment (dev/preview path). */
  async retrievePayment(externalRef: string): Promise<WebhookResult> {
    try {
      const pi = await this.client.paymentIntents.retrieve(externalRef, { expand: ["payment_method"] });
      if (pi.status === "succeeded") {
        const pm = pi.payment_method as Stripe.PaymentMethod | null;
        const walletType = pm?.card?.wallet?.type ?? undefined;
        return { kind: "payment_succeeded", orderId: pi.metadata.orderId ?? "", externalRef: pi.id, walletType };
      }
      if (pi.status === "canceled" || pi.last_payment_error) {
        return { kind: "payment_failed", orderId: pi.metadata.orderId ?? "", externalRef: pi.id };
      }
      return { kind: "ignored" };
    } catch {
      return { kind: "ignored" };
    }
  }
}
