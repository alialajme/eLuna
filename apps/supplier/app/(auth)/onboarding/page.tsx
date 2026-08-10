import { redirect } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata: Metadata = {
  title: "Set up your supplier account — Luna Supplier",
};

export default async function OnboardingPage() {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <div className="text-center">
          <p className="font-display text-display-md text-gold mb-4">Luna Supplier OS</p>
          <Link
            href="/sign-in"
            className="inline-flex rounded-full bg-gold px-6 py-3 text-body-md font-medium text-ink"
          >
            Sign in to continue
          </Link>
        </div>
      </main>
    );
  }

  const supplier = await getSupplierByUserId(user.id);

  // Already onboarded — redirect based on status
  if (supplier?.status === "ACTIVE") redirect("/");
  if (supplier?.status === "PENDING") redirect("/pending");

  const userEmail = user.emailAddresses[0]?.emailAddress ?? "";

  return (
    <main className="min-h-screen bg-ivory">
      <div className="border-b border-sand px-6 py-4">
        <span className="font-display text-display-sm text-gold">✦ Luna</span>
        <span className="text-body-md text-mist ml-2">Supplier setup</span>
      </div>
      <OnboardingWizard userEmail={userEmail} />
    </main>
  );
}
