export type CourierDeliveryStatus = "in_transit" | "delivered" | "exception";

export type CreateShipmentParams = {
  reference: string; // orderId (customer) or materialOrderId (supplier) — opaque to the gateway
  courier: string;
  destination: { name: string; addressLine1: string; city: string; emirate: string | null };
  weightKg?: number;
};

export type CreateShipmentResult =
  | { status: "created"; trackingNumber: string; externalRef: string; labelUrl?: string }
  | { status: "manual" }
  | { status: "failed"; error: string };

export type CourierStatusEvent =
  | { match: { trackingNumber?: string; externalRef?: string }; status: CourierDeliveryStatus }
  | { kind: "ignored" };

export interface CourierGateway {
  createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult>;
  parseWebhook?(rawBody: string, headers: Headers): CourierStatusEvent;
}
