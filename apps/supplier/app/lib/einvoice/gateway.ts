export type InvoiceLine = {
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type IssueParams = {
  invoiceNumber: string;
  supplier: { name: string; trn: string };
  vendor: { name: string };
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  lines: InvoiceLine[];
};

export type IssueResult =
  | { status: "issued"; externalRef: string | null }
  | { status: "failed"; error: string };

export interface EInvoiceGateway {
  issue(params: IssueParams): Promise<IssueResult>;
}
