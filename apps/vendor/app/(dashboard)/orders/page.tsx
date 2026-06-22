import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Orders — Luna Vendor" };

export default function OrdersPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-display-sm font-display text-gold mb-2">📋</p>
      <h2 className="font-display text-display-md text-ink mb-3">Orders</h2>
      <p className="text-body-md text-mist mb-6">Order management is coming in Phase 4c.</p>
      <Link href="/" className="text-body-sm text-gold hover:underline">← Back to dashboard</Link>
    </div>
  );
}
