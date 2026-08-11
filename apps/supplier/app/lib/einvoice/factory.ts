import type { EInvoiceGateway } from "./gateway";
import { SimulatedEInvoice } from "./simulated";
import { FtaEInvoice } from "./fta";
import { hasFtaAccessPoint } from "./config";

/** Never throws. No FTA credentials → SimulatedEInvoice (local compliant issuing). */
export function getEInvoiceGateway(): EInvoiceGateway {
  return hasFtaAccessPoint() ? new FtaEInvoice() : new SimulatedEInvoice();
}
