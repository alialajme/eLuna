import { redirect } from "next/navigation";
import Link from "next/link";
import { safeCurrentUser } from "../lib/auth";
import { getSupplierByUserId } from "../lib/supplier";
import { Sidebar } from "./components/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory">
        <div className="text-center">
          <p className="font-display text-display-md text-ink mb-4">
            Sign in to access your supplier dashboard
          </p>
          <Link
            href="/sign-in"
            className="inline-flex rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const supplier = await getSupplierByUserId(user.id);

  if (!supplier) redirect("/onboarding");
  if (supplier.status === "PENDING") redirect("/pending");
  if (supplier.status === "SUSPENDED" || supplier.status === "REJECTED") {
    redirect("/pending?reason=" + supplier.status.toLowerCase());
  }
  if (supplier.status !== "ACTIVE") redirect("/pending");

  return (
    <div className="flex min-h-screen bg-ivory">
      <Sidebar companyName={supplier.companyName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-sand bg-ivory px-6 py-4">
          <p className="font-display text-display-sm text-ink">{supplier.companyName}</p>
          <span className="text-body-sm text-mist">Supplier OS</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
