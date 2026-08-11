export type InvoiceLine = { description: string; quantity: number; unitPrice: number; lineTotal: number };

export type IssueParams = {
  invoiceNumber: string;
  seller: { name: string; trn: string };
  buyer: { name: string };
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
