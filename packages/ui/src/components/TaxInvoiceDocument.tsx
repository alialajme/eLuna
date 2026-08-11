type Line = { description: string; quantity: number; unitPrice: number; lineTotal: number };

export type TaxInvoiceProps = {
  invoiceNumber: string;
  issuedAt: string;
  seller: { name: string; trn: string };
  buyer: { name: string };
  lines: Line[];
  subtotal: number;
  vatAmount: number;
  total: number;
  externalRef?: string | null;
};

const aed = (n: number) => `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;

export function TaxInvoiceDocument(props: TaxInvoiceProps) {
  const { invoiceNumber, issuedAt, seller, buyer, lines, subtotal, vatAmount, total, externalRef } = props;
  return (
    <div className="rounded-2xl border border-sand bg-white p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-display-md text-ink">Tax Invoice</p>
          <p className="text-body-sm text-mist">{invoiceNumber}</p>
        </div>
        <div className="text-right text-body-sm">
          <p className="font-display text-display-sm text-gold">✦ Luna</p>
          <p className="text-mist">{issuedAt}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-y border-sand py-4 text-body-sm">
        <div>
          <p className="text-label text-mist mb-1">FROM</p>
          <p className="text-ink font-medium">{seller.name}</p>
          <p className="text-mist">TRN: {seller.trn}</p>
        </div>
        <div>
          <p className="text-label text-mist mb-1">BILL TO</p>
          <p className="text-ink font-medium">{buyer.name}</p>
        </div>
      </div>

      <table className="w-full text-body-sm">
        <thead>
          <tr className="border-b border-sand text-body-xs uppercase tracking-wide text-mist">
            <th className="py-2 text-left font-medium">Item</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Unit price</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-sand/60">
              <td className="py-2 text-ink">{l.description}</td>
              <td className="py-2 text-right text-mist">{l.quantity}</td>
              <td className="py-2 text-right text-mist">{aed(l.unitPrice)}</td>
              <td className="py-2 text-right text-ink">{aed(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-56 space-y-1 text-body-sm">
        <div className="flex justify-between"><span className="text-mist">Net</span><span className="text-ink">{aed(subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-mist">VAT (5%)</span><span className="text-ink">{aed(vatAmount)}</span></div>
        <div className="flex justify-between border-t border-sand pt-1 font-medium">
          <span className="text-ink">Total</span><span className="text-ink">{aed(total)}</span>
        </div>
      </div>

      {externalRef && <p className="text-body-xs text-mist">FTA / Peppol reference: {externalRef}</p>}
    </div>
  );
}
