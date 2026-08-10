import type { ShipmentStatus } from "@e-luna/db";

export type CreateShipmentParams = {
  orderId: string;
  courier: string;
  destination: { name: string; addressLine1: string; city: string; emirate: string | null };
  weightKg?: number;
};

export type CreateShipmentResult =
  | { status: "created"; trackingNumber: string; externalRef: string; labelUrl?: string }
  | { status: "manual" }
  | { status: "failed"; error: string };

export type CourierStatusEvent =
  | { match: { trackingNumber?: string; externalRef?: string }; status: ShipmentStatus }
  | { kind: "ignored" };

export interface CourierGateway {
  createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult>;
  parseWebhook?(rawBody: string, headers: Headers): CourierStatusEvent;
}
