import { redirect } from "next/navigation";
import Link from "next/link";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { LunaChatWidget } from "@e-luna/ui";

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
            Sign in to access your vendor dashboard
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

  const vendor = await getVendorByUserId(user.id);

  if (!vendor) redirect("/onboarding");
  if (vendor.status === "PENDING") redirect("/pending");
  if (vendor.status === "SUSPENDED" || vendor.status === "REJECTED") {
    redirect("/pending?reason=" + vendor.status.toLowerCase());
  }

  if (vendor.status !== "ACTIVE") redirect("/pending");

  return (
    <div className="flex min-h-screen bg-ivory">
      <Sidebar storeName={vendor.storeName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar storeName={vendor.storeName} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <LunaChatWidget
        apiPath="/api/assistant"
        title="Seller Assistant"
        greeting="Hi! I can check your stock, suggest pricing, and forecast demand. What would you like to look at?"
        agentType="SELLER"
      />
    </div>
  );
}
