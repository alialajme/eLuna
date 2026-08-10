import type { CourierGateway, CreateShipmentResult } from "./gateway";

/** Fallback for any courier without a configured real adapter: the vendor enters the tracking number (7a behavior). */
export class SimulatedCourier implements CourierGateway {
  async createShipment(): Promise<CreateShipmentResult> {
    return { status: "manual" };
  }
}
