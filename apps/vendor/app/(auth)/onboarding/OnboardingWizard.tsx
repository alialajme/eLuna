"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createVendor, updateVendorProfile, updateVendorIBAN } from "../../actions/vendor";
import { slugify } from "../../lib/slugify";

type Props = {
  userEmail: string;
};

export function OnboardingWizard({ userEmail }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  // Step 2 state
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // Step 3 state
  const [iban, setIban] = useState("");

  function handleNameChange(val: string) {
    setName(val);
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(val));
    }
  }

  function handleStep1() {
    setError(null);
    startTransition(async () => {
      const result = await createVendor(name, slug);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      setStep(2);
    });
  }

  function handleStep2Skip() {
    setStep(3);
  }

  function handleStep2() {
    setError(null);
    startTransition(async () => {
      const result = await updateVendorProfile({ description, logoUrl });
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      setStep(3);
    });
  }

  function handleStep3Skip() {
    setStep(4);
  }

  function handleStep3() {
    setError(null);
    startTransition(async () => {
      const result = await updateVendorIBAN(iban);
      if (!result.success) {
        setError(result.error ?? "Invalid IBAN");
        return;
      }
      setStep(4);
    });
  }

  function handleFinish() {
    router.push("/pending");
  }

  const STEPS = ["Store identity", "About your boutique", "Payout details", "Secure your account"];

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-col items-center gap-1 flex-1">
              <div
                className={`h-2 w-full rounded-full ${
                  i + 1 <= step ? "bg-gold" : "bg-sand"
                }`}
              />
              <span className={`text-body-xs hidden sm:block ${i + 1 === step ? "text-ink" : "text-mist"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-body-sm text-mist">Step {step} of {STEPS.length}</p>
      </div>

      {/* Step 1 — Store Identity */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-display-md text-ink">Name your boutique</h1>
            <p className="text-body-md text-mist mt-1">This is what customers will see on Luna.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-label text-mist block mb-2">STORE NAME</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Hessa's Abayas"
                maxLength={60}
                className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-label text-mist block mb-2">STORE URL</label>
              <div className="flex items-center rounded-xl border border-sand overflow-hidden">
                <span className="px-3 py-3 text-body-sm text-mist bg-sand/50 border-r border-sand">
                  luna.ae/vendors/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="hessas-abayas"
                  maxLength={40}
                  className="flex-1 px-3 py-3 text-body-md text-ink bg-ivory focus:outline-none"
                />
              </div>
              <p className="text-body-xs text-mist mt-1">Lowercase letters, numbers, and hyphens only</p>
            </div>
          </div>
          {error && (
            <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-sm text-coral">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={handleStep1}
            disabled={isPending || !name.trim() || !slug.trim()}
            className="w-full rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Next →"}
          </button>
        </div>
      )}

      {/* Step 2 — About Your Boutique */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-display-md text-ink">Tell us about your boutique</h1>
            <p className="text-body-md text-mist mt-1">Optional — you can add this later in Settings.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-label text-mist block mb-2">DESCRIPTION</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Share your story, your style, what makes your abayas unique…"
                maxLength={400}
                rows={4}
                className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink resize-none"
              />
              <p className="text-body-xs text-mist mt-1">{description.length}/400</p>
            </div>
            <div>
              <label className="text-label text-mist block mb-2">LOGO URL</label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
              />
              <p className="text-body-xs text-mist mt-1">Direct image URL — upload support coming soon</p>
            </div>
          </div>
          {error && (
            <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-sm text-coral">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleStep2Skip}
              className="flex-1 rounded-full border border-sand px-6 py-3 text-body-md text-mist hover:border-ink hover:text-ink transition-colors"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleStep2}
              disabled={isPending}
              className="flex-1 rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save & Continue →"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Payout Details */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-display-md text-ink">Set up payouts</h1>
            <p className="text-body-md text-mist mt-1">Required before your first payout. You can update this in Settings anytime.</p>
          </div>
          <div>
            <label className="text-label text-mist block mb-2">IBAN</label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="AE07 0331 2345 6789 0123 456"
              className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink font-mono"
            />
            <p className="text-body-xs text-mist mt-1">UAE IBAN format · Luna pays out weekly</p>
          </div>
          {error && (
            <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-sm text-coral">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleStep3Skip}
              className="flex-1 rounded-full border border-sand px-6 py-3 text-body-md text-mist hover:border-ink hover:text-ink transition-colors"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleStep3}
              disabled={isPending || !iban.trim()}
              className="flex-1 rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save & Continue →"}
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — MFA */}
      {step === 4 && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-display-md text-ink">Secure your account</h1>
            <p className="text-body-md text-mist mt-1">
              Luna requires two-factor authentication for all sellers to protect your earnings and your customers.
            </p>
          </div>
          <div className="rounded-2xl border border-sand bg-sand/30 p-5 space-y-3">
            <p className="text-body-md text-ink font-medium">How to enable MFA:</p>
            <ol className="list-decimal list-inside space-y-2 text-body-md text-mist">
              <li>Click &quot;Enable MFA&quot; below — your account settings will open in a new tab</li>
              <li>Choose Authenticator app or SMS</li>
              <li>Follow the steps to set it up</li>
              <li>Return here and click &quot;Finish setup&quot;</li>
            </ol>
          </div>
          <a
            href="https://accounts.clerk.dev/user"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-ink px-6 py-3 text-body-md font-medium text-ink hover:bg-ink hover:text-ivory transition-colors"
          >
            Enable MFA ↗
          </a>
          <button
            type="button"
            onClick={handleFinish}
            className="w-full rounded-full bg-gold px-6 py-3 text-body-md font-medium text-ink hover:bg-gold/90 transition-colors"
          >
            Finish setup ✦
          </button>
          <p className="text-body-xs text-mist text-center">
            Submitted as {userEmail}
          </p>
        </div>
      )}
    </div>
  );
}
