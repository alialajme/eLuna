"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCommissionRate } from "../../actions/commissions";

type Props = { vendorId: string; ratePercent: number };

export function CommissionEditor({ vendorId, ratePercent }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ratePercent);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setIsLoading(true);
    setError(null);
    const result = await updateCommissionRate(vendorId, value);
    if ("error" in result) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    setEditing(false);
    setIsLoading(false);
    router.refresh();
  }

  function handleCancel() {
    setValue(ratePercent);
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-body-sm font-medium text-ink">{ratePercent}%</span>
        <button
          onClick={() => setEditing(true)}
          className="text-body-xs text-gold hover:underline"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-16 rounded border border-sand px-2 py-1 text-body-sm text-ink"
        />
        <span className="text-body-xs text-mist">%</span>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="rounded-full bg-sage/20 px-3 py-1 text-body-xs font-medium text-sage hover:bg-sage/30 disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={handleCancel}
          disabled={isLoading}
          className="rounded-full px-3 py-1 text-body-xs text-mist hover:text-ink disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
