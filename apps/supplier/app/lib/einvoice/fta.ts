import type { EInvoiceGateway, IssueParams, IssueResult } from "./gateway";

// Representative scaffold for a real UAE FTA / Peppol Access Point.
// Author-complete but credential-gated — implement against a live Access Point.
// See docs/deployment/einvoicing.md.
export class FtaEInvoice implements EInvoiceGateway {
  async issue(params: IssueParams): Promise<IssueResult> {
    const url = process.env.FTA_ACCESS_POINT_URL;
    const key = process.env.FTA_API_KEY;
    if (!url || !key) return { status: "failed", error: "FTA Access Point not configured" };

    // TODO(operator): map `params` to a Peppol UBL 2.1 Tax Invoice, POST to the Access Point
    // with auth, and return the clearance / transmission id as `externalRef`.
    //   const res = await fetch(`${url}/invoices`, {
    //     method: "POST",
    //     headers: { authorization: `Bearer ${key}`, "content-type": "application/xml" },
    //     body: buildUblXml(params),
    //   });
    //   if (!res.ok) return { status: "failed", error: `FTA ${res.status}` };
    //   const { clearanceId } = await res.json();
    //   return { status: "issued", externalRef: clearanceId };
    return { status: "failed", error: "FtaEInvoice not implemented" };
  }
}
