import { StripeGateway, hasStripe } from "@ayvana/payments";
import { prisma, applyStudioPaymentResult } from "@ayvana/db";
import { logger, getCorrelationId } from "@ayvana/observability";

// Studio billing webhook (subscriptions + credit packs). Signature-verified +
// idempotent: the gateway returns a `orderId` which, for Studio payments, is the
// StudioPayment id. We only act if a StudioPayment with that id exists (so a
// stray customer-order event is a safe no-op), and `applyStudioPaymentResult`
// only transitions a PENDING payment — a duplicate webhook never double-credits.
export async function POST(req: Request) {
  const log = logger.child({ route: "webhooks/stripe-studio", correlationId: getCorrelationId(req) });
  if (!hasStripe()) {
    log.warn("studio webhook received but Stripe not configured");
    return new Response("Stripe not configured", { status: 503 });
  }

  const signature = req.headers.get("stripe-signature") ?? "";
  const rawBody = await req.text();

  let result;
  try {
    result = await new StripeGateway().handleWebhook(rawBody, signature);
  } catch {
    log.warn("studio webhook signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  if (result.kind !== "ignored" && result.orderId) {
    const paymentId = result.orderId;
    const exists = await prisma.studioPayment
      .findUnique({ where: { id: paymentId }, select: { id: true } })
      .catch(() => null);
    if (exists) {
      const outcome =
        result.kind === "payment_succeeded"
          ? ({ kind: "captured", paymentId, externalRef: result.externalRef } as const)
          : ({ kind: "failed", paymentId } as const);
      await applyStudioPaymentResult(outcome).catch((e) =>
        log.error("studio webhook apply failed", { paymentId, err: String(e) }),
      );
    }
  }
  return new Response(null, { status: 200 });
}
