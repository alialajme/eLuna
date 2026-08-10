"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SettingKey } from "@e-luna/db";
import { updateSetting } from "../../actions/settings";

type Field = { key: string; label: string; type: "number" | "boolean" | "string" };
type Props = { fields: Field[]; values: Record<string, number | boolean | string> };

export function SettingsForm({ fields, values }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, String(values[f.key] ?? "")])),
  );
  const [msg, setMsg] = useState<Record<string, string>>({});

  const save = (key: string) => {
    setMsg((m) => ({ ...m, [key]: "" }));
    startTransition(async () => {
      const r = await updateSetting(key as SettingKey, state[key] ?? "");
      if ("error" in r) {
        setMsg((m) => ({ ...m, [key]: r.error }));
        return;
      }
      setMsg((m) => ({ ...m, [key]: "Saved" }));
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.key} className="rounded-lg border border-sand bg-ivory p-4">
          <label className="mb-2 block text-body-sm font-medium text-ink">{f.label}</label>
          <div className="flex items-center gap-3">
            {f.type === "boolean" ? (
              <input
                type="checkbox"
                checked={state[f.key] === "true"}
                onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.checked ? "true" : "false" }))}
                className="h-5 w-5 accent-sage"
              />
            ) : (
              <input
                type={f.type === "number" ? "number" : "text"}
                value={state[f.key] ?? ""}
                onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))}
                className="flex-1 rounded-lg border border-sand bg-white px-3 py-2 text-body-sm text-ink"
              />
            )}
            <button
              type="button"
              onClick={() => save(f.key)}
              disabled={isPending}
              className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-sage hover:text-ink disabled:opacity-50 transition-colors"
            >
              {isPending ? "…" : "Save"}
            </button>
          </div>
          {msg[f.key] && (
            <p className={`mt-1 text-body-xs ${msg[f.key] === "Saved" ? "text-sage" : "text-coral"}`}>
              {msg[f.key]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
