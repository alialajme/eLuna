import { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { safeCurrentUser } from "../lib/auth";

export const metadata: Metadata = {
  title: "Application Under Review — Luna Supplier",
};

type StatusCopy = {
  heading: string;
  body: (email: string) => string;
  steps: string[];
};

const COPY: Record<"pending" | "suspended" | "rejected", StatusCopy> = {
  pending: {
    heading: "Your supplier account is under review",
    body: (email) =>
      `Our team reviews every supplier application within 2–3 business days. You'll receive an email at ${email} once you're approved.`,
    steps: [
      "We verify your company details",
      "We review the materials you supply",
      "You receive an approval email",
      "Your supplier account goes live on Luna",
    ],
  },
  suspended: {
    heading: "Your supplier account is suspended",
    body: (email) =>
      `Access to your supplier dashboard is paused. Our team will reach out at ${email} with the details. If you think this is a mistake, contact us below.`,
    steps: [
      "Our team reviews the reason for suspension",
      "We may request additional information",
      "You receive an update by email",
      "Access is restored once resolved",
    ],
  },
  rejected: {
    heading: "Your supplier application was not approved",
    body: (email) =>
      `We were unable to approve your supplier account at this time. We've sent the details to ${email}. You're welcome to get in touch to discuss reapplying.`,
    steps: [
      "Review the reason we emailed you",
      "Address any requirements raised",
      "Contact us to discuss reapplying",
    ],
  },
};

export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const user = await safeCurrentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "your email";

  const key = reason === "suspended" || reason === "rejected" ? reason : "pending";
  const copy = COPY[key];

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
            <h1 className="font-display text-display-lg text-ink">{copy.heading}</h1>
            <p className="mt-3 text-body-md text-mist">{copy.body(email)}</p>
          </div>
          <div className="rounded-2xl border border-sand bg-sand/30 p-5 text-left space-y-2">
            <p className="text-body-sm font-medium text-ink">What happens next?</p>
            <ul className="space-y-1 text-body-sm text-mist">
              {copy.steps.map((step) => (
                <li key={step}>✦ {step}</li>
              ))}
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
