"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupplierAccount } from "../../actions/suppliers";

const MATERIAL_TYPES = [
  { value: "fabric", label: "Fabric" },
  { value: "trim", label: "Trim" },
  { value: "lining", label: "Lining" },
  { value: "thread", label: "Thread" },
  { value: "hardware", label: "Hardware" },
] as const;

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const input =
  "w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-white focus:outline-none focus:border-ink";

export function AddSupplierForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onName(v: string) {
    setCompanyName(v);
    if (!slugEdited) setCompanySlug(slugify(v));
  }

  function toggle(v: string) {
    setTypes((prev) => (prev.includes(v) ? prev.filter((t) => t !== v) : [...prev, v]));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createSupplierAccount({ email, companyName, companySlug, materialTypes: types });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.push(`/suppliers/${res.id}`);
      router.refresh();
    });
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="space-y-1">
        <label htmlFor="email" className="text-body-xs text-mist">Supplier email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="sales@fabrichouse.ae" className={input} />
      </div>
      <div className="space-y-1">
        <label htmlFor="companyName" className="text-body-xs text-mist">Company name</label>
        <input id="companyName" value={companyName} maxLength={60} onChange={(e) => onName(e.target.value)}
          placeholder="Silk Route Fabrics" className={input} />
      </div>
      <div className="space-y-1">
        <label htmlFor="companySlug" className="text-body-xs text-mist">Supplier URL</label>
        <div className="flex items-center gap-2">
          <span className="text-body-sm text-mist">supply.luna.ae/</span>
          <input id="companySlug" value={companySlug} maxLength={40}
            onChange={(e) => { setSlugEdited(true); setCompanySlug(slugify(e.target.value)); }}
            placeholder="silk-route-fabrics" className={input} />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-body-xs text-mist">Materials supplied</p>
        <div className="flex flex-wrap gap-2">
          {MATERIAL_TYPES.map((m) => (
            <button key={m.value} type="button" onClick={() => toggle(m.value)}
              className={`rounded-full px-4 py-2 text-body-sm transition-colors ${
                types.includes(m.value) ? "bg-ink text-ivory" : "border border-sand text-mist hover:border-ink hover:text-ink"
              }`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-body-sm text-coral">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={submit}
          disabled={isPending || !email || companyName.length < 2 || companySlug.length < 3 || types.length === 0}
          className="rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50">
          {isPending ? "Creating…" : "Create & invite"}
        </button>
        <button type="button" onClick={() => router.push("/suppliers")}
          className="text-body-sm text-mist hover:text-ink transition-colors">Cancel</button>
      </div>
      <p className="text-body-xs text-mist">
        Creates an active supplier account and emails an invitation to set up their login. Without Clerk
        configured (local), the account is created and can be signed into via the demo switch.
      </p>
    </div>
  );
}
