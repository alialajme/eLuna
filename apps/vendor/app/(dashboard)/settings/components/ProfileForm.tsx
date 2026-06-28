"use client";

import { useState, useTransition } from "react";
import { updateVendorProfile } from "../../../actions/vendor";

type Props = {
  storeName: string;
  description: string;
  logoUrl: string;
};

export function ProfileForm({ storeName, description, logoUrl }: Props) {
  const [name, setName] = useState(storeName);
  const [desc, setDesc] = useState(description);
  const [logo, setLogo] = useState(logoUrl);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateVendorProfile({
        storeName: name,
        description: desc,
        logoUrl: logo,
      });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error ?? "Could not save");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-body-xs font-medium text-ink mb-1">
          Store name <span className="text-coral">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-body-xs font-medium text-ink mb-1">
          Description
        </label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none resize-none"
        />
      </div>

      <div>
        <label className="block text-body-xs font-medium text-ink mb-1">
          Logo URL
        </label>
        <input
          type="url"
          value={logo}
          onChange={(e) => setLogo(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none"
        />
        {logo.trim() && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt="Logo preview"
            className="mt-2 h-16 w-16 rounded-full object-cover border border-sand"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-full bg-gold px-4 py-2 text-body-sm font-medium text-ink hover:bg-gold/80 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Save profile"}
        </button>
        {saved && <span className="text-body-sm text-sage">Saved ✓</span>}
        {error && <span className="text-body-sm text-coral">{error}</span>}
      </div>
    </div>
  );
}
