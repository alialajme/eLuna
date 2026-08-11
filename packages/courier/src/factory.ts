import type { CourierGateway } from "./gateway";
import { SimulatedCourier } from "./simulated";
import { AramexCourier } from "./aramex";
import { DhlCourier } from "./dhl";
import { hasAramex, hasDhl } from "./config";

/** Never throws. Unconfigured couriers → SimulatedCourier (manual tracking). */
export function getCourierGateway(courierId: string): CourierGateway {
  switch (courierId) {
    case "aramex":
      return hasAramex() ? new AramexCourier() : new SimulatedCourier();
    case "dhl":
      return hasDhl() ? new DhlCourier() : new SimulatedCourier();
    default:
      return new SimulatedCourier();
  }
}
