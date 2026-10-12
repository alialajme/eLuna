import type { MessagingGateway, SendMessageParams, SendMessageResult, InboundMessage } from "./gateway";

/**
 * Meta WhatsApp Cloud API adapter. Active only when WHATSAPP_PHONE_NUMBER_ID +
 * WHATSAPP_API_TOKEN are set (see config.hasWhatsapp). Scaffolded; the live POST
 * is exercised once real credentials exist.
 */
export class WhatsappGateway implements MessagingGateway {
  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    const token = process.env.WHATSAPP_API_TOKEN!;
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: params.phone, type: "text", text: { body: params.text } }),
      });
      if (!res.ok) return { sent: false, error: `whatsapp ${res.status}` };
      const json = (await res.json()) as { messages?: { id?: string }[] };
      return { sent: true, externalRef: json.messages?.[0]?.id };
    } catch (err) {
      return { sent: false, error: err instanceof Error ? err.message : "send failed" };
    }
  }

  parseWebhook(rawBody: string): InboundMessage {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = JSON.parse(rawBody) as any;
      const msg = b?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (msg?.from && msg?.text?.body) {
        return { kind: "message", from: `+${msg.from}`, text: msg.text.body, externalRef: msg.id };
      }
    } catch {
      /* fall through */
    }
    return { kind: "ignored" };
  }
}
