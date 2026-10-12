import type { MessagingGateway, SendMessageParams, SendMessageResult, InboundMessage } from "./gateway";

/** Keyless fallback: logs the outbound payload, parses a plain `{from,text,id}` webhook. */
export class SimulatedMessaging implements MessagingGateway {
  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    console.info("[messaging:simulated] →", params.phone, JSON.stringify(params.text).slice(0, 120));
    return { sent: true, externalRef: `sim_${Date.now()}` };
  }

  parseWebhook(rawBody: string): InboundMessage {
    try {
      const b = JSON.parse(rawBody) as { from?: unknown; text?: unknown; id?: unknown };
      if (typeof b.from === "string" && typeof b.text === "string") {
        return { kind: "message", from: b.from, text: b.text, externalRef: typeof b.id === "string" ? b.id : undefined };
      }
    } catch {
      /* fall through */
    }
    return { kind: "ignored" };
  }
}
