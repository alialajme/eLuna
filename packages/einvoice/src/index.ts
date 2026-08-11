export type { EInvoiceGateway, IssueParams, IssueResult, InvoiceLine } from "./gateway";
export { SimulatedEInvoice } from "./simulated";
export { FtaEInvoice } from "./fta";
export { hasFtaAccessPoint } from "./config";
export { getEInvoiceGateway } from "./factory";
