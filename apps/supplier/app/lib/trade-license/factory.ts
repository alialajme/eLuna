import type { TradeLicenseVerifier } from "./gateway";
import { SimulatedTradeLicenseVerifier } from "./simulated";
import { RegistryTradeLicenseVerifier } from "./registry";
import { hasTradeLicenseRegistry } from "./config";

/** Never throws. No registry credentials → local simulated verifier. */
export function getTradeLicenseVerifier(): TradeLicenseVerifier {
  return hasTradeLicenseRegistry()
    ? new RegistryTradeLicenseVerifier()
    : new SimulatedTradeLicenseVerifier();
}
