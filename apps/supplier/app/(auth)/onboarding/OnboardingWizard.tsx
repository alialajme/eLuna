"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupplier } from "../../actions/supplier";
import { slugify } from "../../lib/slugify";
import { MATERIAL_TYPES } from "../../lib/materials";

type Props = {
  userEmail: string;
};

const STEPS = ["Company details", "Secure your account"];

export function OnboardingWizard({ userEmail }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [types, setTypes] = useState<string[]>([]);

  function handleNameChange(val: string) {
    setName(val);
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(val));
    }
  }

  function toggleType(value: string) {
    setTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  }

  function handleStep1() {
    setError(null);
    startTransition(async () => {
      const result = await createSupplier(name, slug, types);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      setStep(2);
    });
  }

  function handleFinish() {
    router.push("/pending");
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-col items-center gap-1 flex-1">
              <div className={`h-2 w-full rounded-full ${i + 1 <= step ? "bg-gold" : "bg-sand"}`} />
              <span className={`text-body-xs hidden sm:block ${i + 1 === step ? "text-ink" : "text-mist"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-body-sm text-mist">Step {step} of {STEPS.length}</p>
      </div>

      {/* Step 1 — Company details */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-display-md text-ink">Tell us about your business</h1>
            <p className="text-body-md text-mist mt-1">Vendors will source materials from you on Luna.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="company-name" className="text-label text-mist block mb-2">COMPANY NAME</label>
              <input
                id="company-name"
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Gulf Textiles Trading"
                maxLength={60}
                className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label htmlFor="company-slug" className="text-label text-mist block mb-2">SUPPLIER URL</label>
              <div className="flex items-center rounded-xl border border-sand overflow-hidden">
                <span className="px-3 py-3 text-body-sm text-mist bg-sand/50 border-r border-sand">
                  supply.luna.ae/
                </span>
                <input
                  id="company-slug"
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="gulf-textiles"
                  maxLength={40}
                  className="flex-1 px-3 py-3 text-body-md text-ink bg-ivory focus:outline-none"
                />
              </div>
              <p className="text-body-xs text-mist mt-1">Lowercase letters, numbers, and hyphens only</p>
            </div>
            <div>
              <span className="text-label text-mist block mb-2">WHAT DO YOU SUPPLY?</span>
              <div className="flex flex-wrap gap-2">
                {MATERIAL_TYPES.map((m) => {
                  const active = types.includes(m.value);
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => toggleType(m.value)}
                      className={`rounded-full border px-4 py-2 text-body-sm transition-colors ${
                        active
                          ? "border-ink bg-ink text-ivory"
                          : "border-sand text-mist hover:border-ink hover:text-ink"
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
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
            disabled={isPending || !name.trim() || !slug.trim() || types.length === 0}
            className="w-full rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Next →"}
          </button>
        </div>
      )}

      {/* Step 2 — MFA */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-display-md text-ink">Secure your account</h1>
            <p className="text-body-md text-mist mt-1">
              Luna requires two-factor authentication for all suppliers to protect your business.
            </p>
          </div>
          <div className="rounded-2xl border border-sand bg-sand/30 p-5 space-y-3">
            <p className="text-body-md text-ink font-medium">How to enable MFA:</p>
            <ol className="list-decimal list-inside space-y-2 text-body-md text-mist">
              <li>Open your account settings from the dashboard once approved</li>
              <li>Choose Authenticator app or SMS</li>
              <li>Follow the steps to set it up</li>
            </ol>
          </div>
          <button
            type="button"
            onClick={handleFinish}
            className="w-full rounded-full bg-gold px-6 py-3 text-body-md font-medium text-ink hover:bg-gold/90 transition-colors"
          >
            Finish setup ✦
          </button>
          <p className="text-body-xs text-mist text-center">
            Submitted as {userEmail || "your account"}
          </p>
        </div>
      )}
    </div>
  );
}
