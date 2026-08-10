import type { CourierGateway } from "./gateway";
import { SimulatedCourier } from "./simulated";
import { AramexCourier } from "./aramex";
import { hasAramex } from "./config";

/** Never throws. Unconfigured couriers → SimulatedCourier (manual tracking, 7a behavior). */
export function getCourierGateway(courierId: string): CourierGateway {
  switch (courierId) {
    case "aramex":
      return hasAramex() ? new AramexCourier() : new SimulatedCourier();
    default:
      return new SimulatedCourier();
  }
}
