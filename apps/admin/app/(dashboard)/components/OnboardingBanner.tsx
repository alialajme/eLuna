/**
 * Admin oversight banner on a vendor/supplier detail page: flags an incomplete
 * onboarding so ops knows the partner can't fully transact yet. Purely
 * informational — the partner completes these in their own dashboard.
 */
export function OnboardingBanner({
  ibanMissing,
  mfaMissing,
}: {
  ibanMissing: boolean;
  mfaMissing: boolean;
}) {
  if (!ibanMissing && !mfaMissing) return null;

  const items = [
    ibanMissing ? "payout IBAN missing" : null,
    mfaMissing ? "MFA not enabled" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-lg border border-gold/40 bg-gold/10 p-4">
      <p className="text-body-sm font-medium text-ink">Onboarding incomplete</p>
      <p className="mt-0.5 text-body-xs text-mist">
        This account can&apos;t fully transact yet — {items.join(" · ")}. Products/materials stay
        drafts and payouts are blocked until the IBAN is provided.
      </p>
    </div>
  );
}
