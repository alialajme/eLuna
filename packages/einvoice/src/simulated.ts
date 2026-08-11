import type { EInvoiceGateway, IssueParams, IssueResult } from "./gateway";

// The no-keys default. Issues the invoice locally — the printable invoice page IS the
// compliant document. No network; never fails.
export class SimulatedEInvoice implements EInvoiceGateway {
  async issue(_params: IssueParams): Promise<IssueResult> {
    return { status: "issued", externalRef: null };
  }
}
