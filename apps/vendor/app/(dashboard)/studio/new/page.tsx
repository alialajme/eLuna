"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createGarmentAction, beginShootAction } from "../../../actions/studio";

type Slot = {
  role: string;
  label: string;
  hint: string;
  required: boolean;
};

// Seller-facing roles — plain language, no AI jargon. Front + back are required
// (the shoot needs both faces of the garment); extras sharpen the result.
const SLOTS: Slot[] = [
  { role: "FRONT", label: "Front", hint: "Full front, laid flat or on a form", required: true },
  { role: "BACK", label: "Back", hint: "Full back view", required: true },
  { role: "OPEN", label: "Open", hint: "Opened to show the inside", required: false },
  { role: "DETAIL", label: "Detail", hint: "Embroidery, fabric, or trim", required: false },
];

const BACKGROUNDS = [
  { id: "studio-ivory", label: "Studio ivory", swatch: "#fff8ee" },
  { id: "warm-sand", label: "Warm sand", swatch: "#f0e8d8" },
  { id: "soft-shadow", label: "Soft shadow", swatch: "#e9e3d7" },
  { id: "deep-ink", label: "Deep ink", swatch: "#2a2420" },
] as const;

type SlotState = { file: File; preview: string; width?: number; height?: number };
type Phase = "upload" | "style";

async function readDimensions(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({});
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export default function StudioNewPage() {
  const router = useRouter();
  const [slots, setSlots] = useState<Record<string, SlotState>>({});
  const [phase, setPhase] = useState<Phase>("upload");
  const [background, setBackground] = useState<string>(BACKGROUNDS[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ role?: string; message: string }[]>([]);
  const garmentIdRef = useRef<string | null>(null);

  async function onPick(role: string, file: File | null) {
    if (!file) return;
    setError(null);
    setIssues([]);
    const dims = await readDimensions(file);
    setSlots((prev) => ({
      ...prev,
      [role]: { file, preview: URL.createObjectURL(file), width: dims.width, height: dims.height },
    }));
  }

  function removeSlot(role: string) {
    setSlots((prev) => {
      const next = { ...prev };
      delete next[role];
      return next;
    });
  }

  const filled = Object.keys(slots);
  const hasRequired = SLOTS.filter((s) => s.required).every((s) => slots[s.role]);

  async function continueToStyle() {
    setBusy(true);
    setError(null);
    setIssues([]);
    try {
      const form = new FormData();
      for (const [role, s] of Object.entries(slots)) {
        form.append(`role_${role}`, s.file, s.file.name);
        if (s.width) form.append(`w_${role}`, String(s.width));
        if (s.height) form.append(`h_${role}`, String(s.height));
      }
      const res = await fetch("/api/v1/ai-studio/uploads", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        uploaded?: {
          role: string;
          storageKey: string;
          contentType: string;
          bytes: number;
          width?: number;
          height?: number;
        }[];
      };
      if (!res.ok || !body.uploaded) throw new Error(body.error ?? "Upload failed");

      const created = await createGarmentAction(body.uploaded);
      if (!created.ok) {
        if (created.issues?.length) {
          setIssues(created.issues);
          return;
        }
        throw new Error(created.error ?? "We could not prepare your photos.");
      }
      garmentIdRef.current = created.garmentId;
      setPhase("style");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!garmentIdRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const res = await beginShootAction(garmentIdRef.current, { backgroundId: background });
      if (!res.ok) throw new Error(res.error);
      router.push(`/studio/${res.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the shoot.");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <header className="space-y-1.5">
        <h2 className="font-display text-display-md text-ink">New shoot</h2>
        <p className="text-body-sm text-mist">
          {phase === "upload"
            ? "Add clear photos of your abaya. We check them before the shoot so nothing is wasted."
            : "Choose a backdrop. Your garment, colour, and model stay the same across every angle."}
        </p>
      </header>

      {/* Step rail */}
      <ol className="flex items-center gap-3 text-body-xs">
        <Step n={1} label="Photos" active={phase === "upload"} done={phase === "style"} />
        <span className="h-px w-8 bg-sand" />
        <Step n={2} label="Backdrop" active={phase === "style"} done={false} />
        <span className="h-px w-8 bg-sand" />
        <Step n={3} label="Results" active={false} done={false} />
      </ol>

      {phase === "upload" && (
        <section className="space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SLOTS.map((slot) => {
              const picked = slots[slot.role];
              const flagged = issues.some((i) => i.role === slot.role);
              return (
                <div key={slot.role} className="space-y-1.5">
                  <label className="group relative block cursor-pointer" aria-label={`Upload ${slot.label}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={busy}
                      onChange={(e) => onPick(slot.role, e.target.files?.[0] ?? null)}
                    />
                    <div
                      className={`relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md border bg-white transition-colors ${
                        picked
                          ? flagged
                            ? "border-coral"
                            : "border-gold"
                          : "border-dashed border-sand hover:border-gold/60"
                      }`}
                    >
                      {picked ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={picked.preview} alt={slot.label} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xl text-sand transition-colors group-hover:text-gold/60" aria-hidden>
                          +
                        </span>
                      )}
                      {picked && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            removeSlot(slot.role);
                          }}
                          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-ink/80 text-body-xs text-ivory hover:bg-ink"
                          aria-label={`Remove ${slot.label}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </label>
                  <div className="flex items-baseline justify-between">
                    <span className="text-body-xs font-medium text-ink">
                      {slot.label}
                      {slot.required && <span className="ml-0.5 text-gold">*</span>}
                    </span>
                    {picked && !flagged && <span className="text-body-xs text-sage">Added</span>}
                  </div>
                  <p className="text-body-xs leading-snug text-mist">{slot.hint}</p>
                </div>
              );
            })}
          </div>

          <p className="text-body-xs text-mist">JPG, PNG, or WebP · up to 15 MB each · front and back required</p>

          {issues.length > 0 && (
            <div className="space-y-2 rounded-md border border-coral/40 bg-coral/5 px-4 py-3">
              <p className="text-body-sm font-medium text-coral">Fix these before continuing</p>
              <ul className="space-y-1">
                {issues.map((i, idx) => (
                  <li key={idx} className="text-body-sm text-ink/80">
                    {i.role ? <span className="font-medium">{i.role.toLowerCase()}: </span> : null}
                    {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="rounded-md bg-coral/10 px-4 py-3 text-body-sm text-coral">{error}</p>}

          <button
            onClick={continueToStyle}
            disabled={!hasRequired || busy}
            className="w-full rounded-md bg-ink py-3 text-body-sm font-medium text-gold transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Checking your photos…" : `Continue${filled.length ? ` with ${filled.length} photo${filled.length > 1 ? "s" : ""}` : ""}`}
          </button>
        </section>
      )}

      {phase === "style" && (
        <section className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-body-sm font-medium text-ink">Backdrop</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BACKGROUNDS.map((bg) => {
                const selected = bg.id === background;
                return (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setBackground(bg.id)}
                    className={`group flex flex-col items-stretch gap-2 rounded-md border p-2 text-left transition-colors ${
                      selected ? "border-gold bg-gold/5" : "border-sand hover:border-gold/50"
                    }`}
                    aria-pressed={selected}
                  >
                    <span
                      className="h-16 w-full rounded-sm border border-black/5"
                      style={{ backgroundColor: bg.swatch }}
                      aria-hidden
                    />
                    <span className="text-body-xs font-medium text-ink">{bg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border border-sand bg-white px-4 py-3">
            <p className="text-body-sm text-ink">
              We will create four on-model views — front, back, and both three-quarter angles — from your photos.
            </p>
            <p className="mt-1 text-body-xs text-mist">Takes a minute or two. You can leave this page and come back.</p>
          </div>

          {error && <p className="rounded-md bg-coral/10 px-4 py-3 text-body-sm text-coral">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setPhase("upload")}
              disabled={busy}
              className="rounded-md border border-sand px-5 py-3 text-body-sm font-medium text-ink transition-colors hover:border-gold/60 disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={generate}
              disabled={busy}
              className="flex-1 rounded-md bg-ink py-3 text-body-sm font-medium text-gold transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Starting your shoot…" : "Generate shoot"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-md text-body-xs font-medium ${
          done ? "bg-sage/20 text-sage" : active ? "bg-ink text-gold" : "bg-sand text-mist"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <span className={`font-medium ${active ? "text-ink" : "text-mist"}`}>{label}</span>
    </li>
  );
}
