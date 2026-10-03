import Link from "next/link";

/**
 * Shown across the vendor dashboard until the payout IBAN is on file. Without it,
 * products can't be published (they stay drafts) and payouts can't be issued.
 * (MFA is enforced at the login gate, so it isn't surfaced here.)
 */
export function OnboardingBanner() {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4">
      <div>
        <p className="text-body-md font-medium text-ink">Finish setting up your store</p>
        <p className="text-body-sm text-mist">
          Add your payout IBAN to publish products and receive payouts. You can keep products as
          drafts until then.
        </p>
      </div>
      <Link
        href="/settings"
        className="shrink-0 rounded-md bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors"
      >
        Add payout IBAN
      </Link>
    </div>
  );
}
