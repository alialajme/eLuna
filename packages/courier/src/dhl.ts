import type { CourierGateway, CreateShipmentParams, CreateShipmentResult, CourierStatusEvent } from "./gateway";

// Integration point: DHL Express MyDHL API — https://developer.dhl.com.
// Required env: DHL_API_KEY, DHL_ACCOUNT_NUMBER, DHL_WEBHOOK_SECRET.
// Only instantiated by the factory when hasDhl() is true.
export class DhlCourier implements CourierGateway {
  async createShipment(_params: CreateShipmentParams): Promise<CreateShipmentResult> {
    // TODO(operator): POST a shipment to DHL; on success return
    //   { status: "created", trackingNumber, externalRef, labelUrl }.
    return { status: "failed", error: "DHL API not configured" };
  }

  parseWebhook(_rawBody: string, _headers: Headers): CourierStatusEvent {
    // TODO(operator): verify DHL_WEBHOOK_SECRET, parse the event, map the DHL status to a
    //   CourierDeliveryStatus, and return { match: { externalRef | trackingNumber }, status }.
    return { kind: "ignored" };
  }
}
