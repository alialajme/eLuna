import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Payouts — Luna Vendor" };

export default function PayoutsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-display-sm font-display text-gold mb-2">💸</p>
      <h2 className="font-display text-display-md text-ink mb-3">Payouts</h2>
      <p className="text-body-md text-mist mb-6">Payout management is coming in Phase 4d.</p>
      <Link href="/" className="text-body-sm text-gold hover:underline">← Back to dashboard</Link>
    </div>
  );
}
