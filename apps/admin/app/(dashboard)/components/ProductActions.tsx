"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductStatus } from "@e-luna/db";
import { rejectProduct, reinstateProduct } from "../../actions/products";

type Props = {
  productId: string;
  status: ProductStatus;
};

type ActionResult = { success: true } | { error: string };

export function ProductActions({ productId, status }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (id: string) => Promise<ActionResult>) {
    setIsLoading(true);
    setError(null);
    const result = await action(productId);
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
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {status === "REJECTED" && (
          <button
            onClick={() => run(reinstateProduct)}
            disabled={isLoading}
            className={approveBtn}
          >
            Reinstate
          </button>
        )}

        {(status === "ACTIVE" || status === "DRAFT") && (
          <button
            onClick={() => run(rejectProduct)}
            disabled={isLoading}
            className={dangerBtn}
          >
            Reject
          </button>
        )}
      </div>

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
