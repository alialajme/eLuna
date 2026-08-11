import type { CourierGateway, CreateShipmentResult } from "./gateway";

/** Fallback for any courier without a configured real adapter: the shipper enters the tracking number. */
export class SimulatedCourier implements CourierGateway {
  async createShipment(): Promise<CreateShipmentResult> {
    return { status: "manual" };
  }
}
