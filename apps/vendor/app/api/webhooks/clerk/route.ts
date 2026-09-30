import { verifyClerkWebhook } from "@ayvana/auth";
import { reconcileClerkUser, type ClerkWebhookEvent } from "@ayvana/db";

// Clerk user.created / user.updated → DB User. Reconciles admin-provisioned
// placeholder accounts (inv_…) to the real Clerk id by email, and creates rows
// for normal signups. Credential-gated: no CLERK_WEBHOOK_SECRET → no-op (local).
export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response(null, { status: 200 });

  const payload = await req.text();
  const verified = verifyClerkWebhook(
    payload,
    {
      svixId: req.headers.get("svix-id"),
      svixTimestamp: req.headers.get("svix-timestamp"),
      svixSignature: req.headers.get("svix-signature"),
    },
    secret,
  );
  if (!verified) return new Response("Invalid signature", { status: 400 });

  let event: ClerkWebhookEvent;
  try {
    event = JSON.parse(payload) as ClerkWebhookEvent;
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  try {
    const result = await reconcileClerkUser(event);
    return Response.json(result);
  } catch (err) {
    console.error("[clerk webhook] reconcile failed", err);
    return new Response("Reconcile failed", { status: 500 });
  }
}
