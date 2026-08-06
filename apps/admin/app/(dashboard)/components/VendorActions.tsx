"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VendorStatus } from "@e-luna/db";
import {
  approveVendor,
  rejectVendor,
  suspendVendor,
  reactivateVendor,
} from "../../actions/sellers";

type Props = {
  vendorId: string;
  status: VendorStatus;
};

type ActionResult = { success: true } | { error: string };

export function VendorActions({ vendorId, status }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (id: string) => Promise<ActionResult>) {
    setIsLoading(true);
    setError(null);
    const result = await action(vendorId);
    if ("error" in result) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    router.refresh();
    setIsLoading(false);
  }

  const approveBtn =
    "rounded-full bg-sage/20 px-4 py-2 text-body-sm font-medium text-sage hover:bg-sage/30 disabled:opacity-50";
  const dangerBtn =
    "rounded-full bg-coral/20 px-4 py-2 text-body-sm font-medium text-coral hover:bg-coral/30 disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "PENDING" && (
          <>
            <button
              onClick={() => run(approveVendor)}
              disabled={isLoading}
              className={approveBtn}
            >
              Approve
            </button>
            <button
              onClick={() => run(rejectVendor)}
              disabled={isLoading}
              className={dangerBtn}
            >
              Reject
            </button>
          </>
        )}

        {status === "ACTIVE" && (
          <button
            onClick={() => run(suspendVendor)}
            disabled={isLoading}
            className={dangerBtn}
          >
            Suspend
          </button>
        )}

        {status === "SUSPENDED" && (
          <button
            onClick={() => run(reactivateVendor)}
            disabled={isLoading}
            className={approveBtn}
          >
            Reactivate
          </button>
        )}

        {status === "REJECTED" && (
          <button
            onClick={() => run(approveVendor)}
            disabled={isLoading}
            className={approveBtn}
          >
            Approve
          </button>
        )}
      </div>

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
