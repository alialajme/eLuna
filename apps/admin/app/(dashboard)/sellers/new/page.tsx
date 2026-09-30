import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeCurrentUser } from "../../../lib/auth";
import { AddVendorForm } from "../../components/AddVendorForm";

export const metadata: Metadata = { title: "Add Vendor — AYVANA Ops" };

export default async function AddVendorPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  return (
    <div className="max-w-lg space-y-5">
      <Link href="/sellers" className="text-body-sm text-mist hover:text-ink">← Back to sellers</Link>
      <div>
        <h2 className="font-display text-display-md text-ink">Add vendor</h2>
        <p className="mt-1 text-body-sm text-mist">
          Provision a contracted vendor so they can publish products.
        </p>
      </div>
      <AddVendorForm />
    </div>
  );
}
