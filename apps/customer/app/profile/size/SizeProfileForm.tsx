"use client";

import { useState, useTransition } from "react";
import { saveSizeProfile, type SizeProfileFormData } from "../../actions/profile";

type Props = {
  initial: SizeProfileFormData;
};

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const SIZE_SYSTEMS = ["INTL", "US", "UK", "EU", "GCC"];
const SLEEVE_LENGTHS = ["SHORT", "THREE_QUARTER", "FULL"];
const ABAYA_LENGTHS = ["MIDI", "MAXI", "FLOOR"];
const FIT_PREFS = ["FITTED", "REGULAR", "LOOSE", "OVERSIZED"];

export function SizeProfileForm({ initial }: Props) {
  const [form, setForm] = useState<SizeProfileFormData>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set(key: keyof SizeProfileFormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveSizeProfile(form);
      if (result.success) {
        setSaved(true);
      } else {
        setError(result.error ?? "Could not save");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section>
        <h2 className="font-display text-display-sm text-ink mb-4">Your Size</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <label className="text-label text-mist block mb-2">USUAL SIZE</label>
            <select
              value={form.usualSize ?? ""}
              onChange={(e) => set("usualSize", e.target.value)}
              className="w-full rounded-lg border border-sand px-3 py-2 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
            >
              <option value="">Select</option>
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-label text-mist block mb-2">SIZE SYSTEM</label>
            <select
              value={form.sizeSystem ?? "INTL"}
              onChange={(e) => set("sizeSystem", e.target.value)}
              className="w-full rounded-lg border border-sand px-3 py-2 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
            >
              {SIZE_SYSTEMS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-display-sm text-ink mb-1">Body Measurements</h2>
        <p className="text-body-sm text-mist mb-4">All measurements in cm</p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { key: "height", label: "HEIGHT" },
            { key: "weight", label: "WEIGHT (kg)" },
            { key: "bust", label: "BUST" },
            { key: "waist", label: "WAIST" },
            { key: "hip", label: "HIP" },
            { key: "shoulder", label: "SHOULDER" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="text-label text-mist block mb-2">{label}</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={(form as Record<string, string>)[key] ?? ""}
                onChange={(e) => set(key as keyof SizeProfileFormData, e.target.value)}
                placeholder="—"
                className="w-full rounded-lg border border-sand px-3 py-2 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-display-sm text-ink mb-4">Garment Preferences</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="text-label text-mist block mb-2">SLEEVE LENGTH</label>
            <select
              value={form.sleeveLength ?? ""}
              onChange={(e) => set("sleeveLength", e.target.value)}
              className="w-full rounded-lg border border-sand px-3 py-2 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
            >
              <option value="">Any</option>
              {SLEEVE_LENGTHS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="text-label text-mist block mb-2">ABAYA LENGTH</label>
            <select
              value={form.preferredAbayaLength ?? ""}
              onChange={(e) => set("preferredAbayaLength", e.target.value)}
              className="w-full rounded-lg border border-sand px-3 py-2 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
            >
              <option value="">Any</option>
              {ABAYA_LENGTHS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-label text-mist block mb-2">FIT PREFERENCE</label>
            <select
              value={form.fitPreference ?? ""}
              onChange={(e) => set("fitPreference", e.target.value)}
              className="w-full rounded-lg border border-sand px-3 py-2 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
            >
              <option value="">Any</option>
              {FIT_PREFS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-md text-coral">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-xl bg-sage/10 border border-sage px-4 py-3 text-body-md text-sage">
          ✦ Luna will use your measurements to find your perfect fit.
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-ink px-8 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save Profile"}
      </button>
    </form>
  );
}
