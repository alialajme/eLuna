"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PayoutStatus } from "@e-luna/db";
import { markProcessing, markCompleted, markFailed } from "../../actions/payouts";

type Props = { payoutId: string; status: PayoutStatus };
type ActionResult = { success: true } | { error: string };

export function PayoutActions({ payoutId, status }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (id: string) => Promise<ActionResult>) {
    setIsLoading(true);
    setError(null);
    const result = await action(payoutId);
    if ("error" in result) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    router.refresh();
    setIsLoading(false);
  }

  const goldBtn =
    "rounded-full bg-gold/20 px-4 py-2 text-body-sm font-medium text-gold hover:bg-gold/30 disabled:opacity-50";
  const sageBtn =
    "rounded-full bg-sage/20 px-4 py-2 text-body-sm font-medium text-sage hover:bg-sage/30 disabled:opacity-50";
  const coralBtn =
    "rounded-full bg-coral/20 px-4 py-2 text-body-sm font-medium text-coral hover:bg-coral/30 disabled:opacity-50";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {status === "PENDING" && (
          <>
            <button onClick={() => run(markProcessing)} disabled={isLoading} className={goldBtn}>
              Mark Processing
            </button>
            <button onClick={() => run(markFailed)} disabled={isLoading} className={coralBtn}>
              Mark Failed
            </button>
          </>
        )}
        {status === "PROCESSING" && (
          <>
            <button onClick={() => run(markCompleted)} disabled={isLoading} className={sageBtn}>
              Mark Completed
            </button>
            <button onClick={() => run(markFailed)} disabled={isLoading} className={coralBtn}>
              Mark Failed
            </button>
          </>
        )}
      </div>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
