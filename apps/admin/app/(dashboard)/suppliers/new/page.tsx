import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeCurrentUser } from "../../../lib/auth";
import { AddSupplierForm } from "../../components/AddSupplierForm";

export const metadata: Metadata = { title: "Add Supplier — Luna Ops" };

export default async function AddSupplierPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  return (
    <div className="max-w-lg space-y-5">
      <Link href="/suppliers" className="text-body-sm text-mist hover:text-ink">← Back to suppliers</Link>
      <div>
        <h2 className="font-display text-display-md text-ink">Add supplier</h2>
        <p className="mt-1 text-body-sm text-mist">
          Provision a contracted materials supplier so they can list and fulfil orders.
        </p>
      </div>
      <AddSupplierForm />
    </div>
  );
}
