import { StripeGateway } from "@e-luna/payments";
import { applyPaymentResult } from "@e-luna/payments";
import { hasStripe } from "@e-luna/payments";

export async function POST(req: Request) {
  if (!hasStripe()) return new Response("Stripe not configured", { status: 503 });

  const signature = req.headers.get("stripe-signature") ?? "";
  const rawBody = await req.text(); // raw body required for signature verification

  let result;
  try {
    result = await new StripeGateway().handleWebhook(rawBody, signature);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (result.kind !== "ignored" && result.orderId) {
    await applyPaymentResult(result).catch((e) => console.error("[stripe webhook] apply failed", e));
  }
  return new Response(null, { status: 200 }); // 200 for ignored/missing too, so Stripe stops retrying
}
