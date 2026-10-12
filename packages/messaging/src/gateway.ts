export type SendMessageParams = { phone: string; text: string; templateId?: string };

export type SendMessageResult = { sent: true; externalRef?: string } | { sent: false; error: string };

export type InboundMessage =
  | { kind: "message"; from: string; text: string; externalRef?: string }
  | { kind: "ignored" };

export interface MessagingGateway {
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
  parseWebhook(rawBody: string, headers?: Headers): InboundMessage;
}
