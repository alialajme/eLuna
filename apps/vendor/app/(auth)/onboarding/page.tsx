import { redirect } from "next/navigation";
import { Metadata } from "next";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata: Metadata = {
  title: "Set up your boutique — Luna Vendor",
};

export default async function OnboardingPage() {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <div className="text-center">
          <p className="font-display text-display-md text-gold mb-4">Luna Vendor OS</p>
          <a
            href="/sign-in"
            className="inline-flex rounded-full bg-gold px-6 py-3 text-body-md font-medium text-ink"
          >
            Sign in to continue
          </a>
        </div>
      </main>
    );
  }

  const vendor = await getVendorByUserId(user.id);

  // Already onboarded — redirect based on status
  if (vendor?.status === "ACTIVE") redirect("/");
  if (vendor?.status === "PENDING") redirect("/pending");

  const userEmail = user.emailAddresses[0]?.emailAddress ?? "";

  return (
    <main className="min-h-screen bg-ivory">
      {/* Logo strip */}
      <div className="border-b border-sand px-6 py-4">
        <span className="font-display text-display-sm text-gold">✦ Luna</span>
        <span className="text-body-md text-mist ml-2">Vendor setup</span>
      </div>
      <OnboardingWizard userEmail={userEmail} />
    </main>
  );
}
