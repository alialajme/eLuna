import { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { safeCurrentUser } from "../lib/auth";

export const metadata: Metadata = {
  title: "Application Under Review — Luna Supplier",
};

export default async function PendingPage() {
  const user = await safeCurrentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "your email";

  return (
    <main className="flex min-h-screen flex-col bg-ivory">
      <div className="bg-ink px-6 py-4 flex items-center justify-between">
        <span className="font-display text-display-sm text-gold">✦ Luna</span>
        {user && (
          <SignOutButton>
            <button className="text-body-sm text-mist hover:text-ivory transition-colors">
              Sign out
            </button>
          </SignOutButton>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-md text-center space-y-6">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gold/20">
            <span className="font-display text-display-lg text-gold">✦</span>
          </div>
          <div>
            <h1 className="font-display text-display-lg text-ink">
              Your supplier account is under review
            </h1>
            <p className="mt-3 text-body-md text-mist">
              Our team reviews every supplier application within{" "}
              <strong className="text-ink">2–3 business days</strong>. You&apos;ll
              receive an email at <strong className="text-ink">{email}</strong> once
              you&apos;re approved.
            </p>
          </div>
          <div className="rounded-2xl border border-sand bg-sand/30 p-5 text-left space-y-2">
            <p className="text-body-sm font-medium text-ink">What happens next?</p>
            <ul className="space-y-1 text-body-sm text-mist">
              <li>✦ We verify your company details</li>
              <li>✦ We review the materials you supply</li>
              <li>✦ You receive an approval email</li>
              <li>✦ Your supplier account goes live on Luna</li>
            </ul>
          </div>
          <p className="text-body-sm text-mist">
            Questions?{" "}
            <a href="mailto:suppliers@luna.ae" className="text-gold hover:underline">
              suppliers@luna.ae
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
