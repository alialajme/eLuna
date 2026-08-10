import type { CourierGateway, CreateShipmentParams, CreateShipmentResult, CourierStatusEvent } from "./gateway";

// Integration point: Aramex Shipping API — https://www.aramex.com (Developers Solutions Center).
// Required env: ARAMEX_API_KEY, ARAMEX_ACCOUNT_NUMBER, ARAMEX_ACCOUNT_PIN, ARAMEX_WEBHOOK_SECRET.
// Only instantiated by the factory when hasAramex() is true. This is the TEMPLATE other couriers copy.
export class AramexCourier implements CourierGateway {
  async createShipment(_params: CreateShipmentParams): Promise<CreateShipmentResult> {
    // TODO(operator): POST a shipment to Aramex; on success return
    //   { status: "created", trackingNumber, externalRef, labelUrl }.
    return { status: "failed", error: "Aramex API not configured" };
  }

  parseWebhook(_rawBody: string, _headers: Headers): CourierStatusEvent {
    // TODO(operator): verify ARAMEX_WEBHOOK_SECRET, parse the event, map the Aramex status to a
    //   ShipmentStatus, and return { match: { externalRef | trackingNumber }, status }.
    return { kind: "ignored" };
  }
}
