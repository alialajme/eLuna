export type ChargeParams = {
  amount: number;
  currency: string;
  orderId: string;
  customerEmail: string;
  description: string;
  metadata?: Record<string, string>;
};

export type ChargeResult = {
  success: boolean;
  externalRef: string;
  error?: string;
};

export type RefundParams = {
  externalRef: string;
  amount: number;
  reason?: string;
};

export type RefundResult = {
  success: boolean;
  error?: string;
};

export interface PaymentGateway {
  charge(params: ChargeParams): Promise<ChargeResult>;
  refund(params: RefundParams): Promise<RefundResult>;
}
