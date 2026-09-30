"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createVendorAccount } from "../../actions/sellers";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const input =
  "w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-white focus:outline-none focus:border-ink";

export function AddVendorForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onName(v: string) {
    setStoreName(v);
    if (!slugEdited) setStoreSlug(slugify(v));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createVendorAccount({ email, storeName, storeSlug });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.push(`/sellers/${res.id}`);
      router.refresh();
    });
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="space-y-1">
        <label htmlFor="email" className="text-body-xs text-mist">Vendor email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="owner@boutique.ae" className={input} />
      </div>
      <div className="space-y-1">
        <label htmlFor="storeName" className="text-body-xs text-mist">Store name</label>
        <input id="storeName" value={storeName} maxLength={60} onChange={(e) => onName(e.target.value)}
          placeholder="Aisha Couture" className={input} />
      </div>
      <div className="space-y-1">
        <label htmlFor="storeSlug" className="text-body-xs text-mist">Store URL</label>
        <div className="flex items-center gap-2">
          <span className="text-body-sm text-mist">sell.ayvana.ae/</span>
          <input id="storeSlug" value={storeSlug} maxLength={40}
            onChange={(e) => { setSlugEdited(true); setStoreSlug(slugify(e.target.value)); }}
            placeholder="aisha-couture" className={input} />
        </div>
      </div>

      {error && <p className="text-body-sm text-coral">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={submit}
          disabled={isPending || !email || storeName.length < 2 || storeSlug.length < 3}
          className="rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50">
          {isPending ? "Creating…" : "Create & invite"}
        </button>
        <button type="button" onClick={() => router.push("/sellers")}
          className="text-body-sm text-mist hover:text-ink transition-colors">Cancel</button>
      </div>
      <p className="text-body-xs text-mist">
        Creates an active vendor account and emails an invitation to set up their login. Without Clerk
        configured (local), the account is created and can be signed into via the demo switch.
      </p>
    </div>
  );
}
