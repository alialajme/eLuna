import { timingSafeEqual } from "node:crypto";
import { prisma, createCase, addCaseMessage } from "@ayvana/db";
import { getMessagingGateway } from "@ayvana/messaging";

export const dynamic = "force-dynamic";

/** Constant-time string compare that never short-circuits on length. */
function tokenMatches(provided: string, expected: string | undefined): boolean {
  if (!expected) return false; // no verify token configured -> reject
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch; compare against a fixed-size
  // digest-like buffer pair so the length itself isn't a timing oracle.
  if (a.length !== b.length) {
    // Still spend the comparison to avoid a fast-path length leak.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Meta verification handshake (GET): echo hub.challenge when the token matches. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && tokenMatches(token, process.env.WHATSAPP_VERIFY_TOKEN)) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

/** Inbound message (POST): append to the opener's open case, or open a new one. */
export async function POST(req: Request) {
  const raw = await req.text();
  const parsed = getMessagingGateway().parseWebhook(raw, req.headers);
  if (parsed.kind !== "message") return Response.json({ ok: true });

  // Match only prior WHATSAPP-channel cases for this phone. An inbound WhatsApp
  // message (account-less, unverified sender) must NEVER attach to a web/mobile
  // case that merely shares a phone number — that would let an anonymous sender
  // inject into an authenticated opener's thread.
  const existing = await prisma.case
    .findFirst({
      where: {
        contactPhone: parsed.from,
        channel: "WHATSAPP",
        status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    .catch(() => null);

  if (existing) {
    await addCaseMessage({ caseId: existing.id, authorRole: "CUSTOMER", body: parsed.text, channel: "WHATSAPP", externalRef: parsed.externalRef ?? null });
    return Response.json({ ok: true, caseId: existing.id });
  }

  const other = await prisma.caseCategory.findUnique({ where: { slug: "other" }, select: { id: true } }).catch(() => null);
  const category = other ?? (await prisma.caseCategory.findFirstOrThrow({ select: { id: true } }));
  const res = await createCase({
    type: "QUESTION",
    categoryId: category.id,
    channel: "WHATSAPP",
    subject: parsed.text.slice(0, 60) || "WhatsApp message",
    description: parsed.text,
    openerRole: "CUSTOMER",
    contact: { name: parsed.from, phone: parsed.from },
  });
  return Response.json({ ok: true, caseId: res.id });
}
