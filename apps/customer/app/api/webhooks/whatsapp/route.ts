import { prisma, createCase, addCaseMessage } from "@ayvana/db";
import { getMessagingGateway } from "@ayvana/messaging";

export const dynamic = "force-dynamic";

/** Meta verification handshake (GET): echo hub.challenge when the token matches. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

/** Inbound message (POST): append to the opener's open case, or open a new one. */
export async function POST(req: Request) {
  const raw = await req.text();
  const parsed = getMessagingGateway().parseWebhook(raw, req.headers);
  if (parsed.kind !== "message") return Response.json({ ok: true });

  const existing = await prisma.case
    .findFirst({
      where: { contactPhone: parsed.from, status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
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
