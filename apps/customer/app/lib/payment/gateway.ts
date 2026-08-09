export type CreatePaymentParams = {
  amount: number;
  currency: string;
  orderId: string;
  customerEmail: string;
  description: string;
  metadata?: Record<string, string>;
};

export type CreatePaymentResult =
  | { status: "captured"; externalRef: string }
  | { status: "requires_action"; externalRef: string; clientSecret: string }
  | { status: "failed"; error: string };

export type RefundParams = {
  externalRef: string;
  amount: number;
  reason?: string;
};

export type RefundResult = {
  success: boolean;
  error?: string;
};

export type WebhookResult =
  | { kind: "payment_succeeded"; orderId: string; externalRef: string; walletType?: string }
  | { kind: "payment_failed"; orderId: string; externalRef: string }
  | { kind: "ignored" };

export interface PaymentGateway {
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  refund(params: RefundParams): Promise<RefundResult>;
  handleWebhook?(rawBody: string, signature: string): Promise<WebhookResult>;
}
