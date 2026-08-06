"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPayout } from "../../actions/payouts";

type Props = { vendorId: string; disabled?: boolean };

export function CreatePayoutButton({ vendorId, disabled }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setError(null);
    const result = await createPayout(vendorId);
    if ("error" in result) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    router.refresh();
    setIsLoading(false);
  }

  return (
    <div className="space-y-1 text-right">
      <button
        onClick={handleClick}
        disabled={disabled || isLoading}
        className="rounded-full bg-sage/20 px-4 py-2 text-body-sm font-medium text-sage hover:bg-sage/30 disabled:opacity-50"
      >
        {isLoading ? "Creating…" : "Create Payout"}
      </button>
      {disabled && <p className="text-body-xs text-mist">No IBAN</p>}
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
