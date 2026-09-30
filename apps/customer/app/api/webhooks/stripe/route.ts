import { StripeGateway } from "@ayvana/payments";
import { applyPaymentResult } from "@ayvana/payments";
import { hasStripe } from "@ayvana/payments";
import { logger, getCorrelationId } from "@ayvana/observability";

export async function POST(req: Request) {
  const log = logger.child({ route: "webhooks/stripe", correlationId: getCorrelationId(req) });
  if (!hasStripe()) {
    log.warn("stripe webhook received but Stripe not configured");
    return new Response("Stripe not configured", { status: 503 });
  }

  const signature = req.headers.get("stripe-signature") ?? "";
  const rawBody = await req.text(); // raw body required for signature verification

  let result;
  try {
    result = await new StripeGateway().handleWebhook(rawBody, signature);
  } catch {
    log.warn("stripe webhook signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  if (result.kind !== "ignored" && result.orderId) {
    log.info("stripe webhook applying payment result", { kind: result.kind, orderId: result.orderId });
    await applyPaymentResult(result).catch((e) =>
      log.error("stripe webhook apply failed", { orderId: result.orderId, err: String(e) }),
    );
  }
  return new Response(null, { status: 200 }); // 200 for ignored/missing too, so Stripe stops retrying
}
