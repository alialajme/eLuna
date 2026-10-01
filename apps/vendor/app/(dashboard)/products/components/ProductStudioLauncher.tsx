"use client";

import { useEffect, useRef, useState } from "react";
import {
  createGarmentAction,
  beginShootAction,
  approveShootAction,
} from "../../../actions/studio";

// The AI shoot, embedded in the product flow. This is the alternative to typing
// image URLs: a vendor with no studio photographs the garment here instead, and
// the four approved on-model views become the product's images.
//
// Scoped to the product being edited (productId present) or created (undefined —
// the shoot runs unlinked and is linked after the product saves). Nothing here
// trusts a vendorId or productId from the client; the server actions re-resolve
// the vendor and ownership-check the product on every call.

type Slot = { role: string; label: string; hint: string; required: boolean };

const SLOTS: Slot[] = [
  { role: "FRONT", label: "Front", hint: "Full front, flat or on a form", required: true },
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
type Step = "photos" | "backdrop" | "shoot";

type SessionSnapshot = {
  id: string;
  status: string;
  assets: { id: string; type: string; url: string; isSimulated: boolean }[];
};

const TERMINAL = new Set(["PREVIEW", "APPROVED", "PUBLISHED", "FAILED", "REVIEW_REQUIRED", "CANCELLED"]);

const IMAGE_ORDER = ["IMAGE_FRONT", "IMAGE_34_FRONT", "IMAGE_34_BACK", "IMAGE_BACK"];
const IMAGE_LABEL: Record<string, string> = {
  IMAGE_FRONT: "Front",
  IMAGE_34_FRONT: "¾ front",
  IMAGE_34_BACK: "¾ back",
  IMAGE_BACK: "Back",
};

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

type Props = {
  productId?: string;
  /** Approved images become the product's images; sessionId links a new product after save. */
  onApproved: (images: string[], sessionId: string) => void;
  onClose: () => void;
};

export function ProductStudioLauncher({ productId, onApproved, onClose }: Props) {
  const [step, setStep] = useState<Step>("photos");
  const [slots, setSlots] = useState<Record<string, SlotState>>({});
  const [background, setBackground] = useState<string>(BACKGROUNDS[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ role?: string; message: string }[]>([]);

  const garmentIdRef = useRef<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on Escape — the overlay holds focus for a multi-step task, so a clear
  // keyboard exit matters.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Poll the shoot once it's running, until it reaches a terminal state.
  useEffect(() => {
    if (!sessionId) return;
    if (session && TERMINAL.has(session.status)) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/v1/ai-studio/generations/${sessionId}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { session: SessionSnapshot };
          if (!cancelled && body.session) {
            setSession(body.session);
            if (!TERMINAL.has(body.session.status)) pollTimer.current = setTimeout(poll, 2500);
          }
        } else if (!cancelled) {
          pollTimer.current = setTimeout(poll, 4000);
        }
      } catch {
        if (!cancelled) pollTimer.current = setTimeout(poll, 4000);
      }
    }

    pollTimer.current = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [sessionId, session]);

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

  const hasRequired = SLOTS.filter((s) => s.required).every((s) => slots[s.role]);

  async function continueToBackdrop() {
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

      const created = await createGarmentAction(body.uploaded, productId ?? null);
      if (!created.ok) {
        if (created.issues?.length) {
          setIssues(created.issues);
          return;
        }
        throw new Error(created.error ?? "We could not prepare your photos.");
      }
      garmentIdRef.current = created.garmentId;
      setStep("backdrop");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function startShoot() {
    if (!garmentIdRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const res = await beginShootAction(garmentIdRef.current, {
        backgroundId: background,
        productId: productId ?? null,
      });
      if (!res.ok) throw new Error(res.error);
      setSessionId(res.sessionId);
      setStep("shoot");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the shoot.");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await approveShootAction(sessionId);
      if (!res.ok) throw new Error(res.error);
      onApproved(res.images, sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use these images.");
      setBusy(false);
    }
  }

  const images = session
    ? session.assets
        .filter((a) => a.type !== "VIDEO_TURNTABLE")
        .sort((a, b) => IMAGE_ORDER.indexOf(a.type) - IMAGE_ORDER.indexOf(b.type))
    : [];
  const simulated = images.some((a) => a.isSimulated);
  const shootRunning = !!session && !TERMINAL.has(session.status);
  const ready = !!session && (session.status === "PREVIEW" || session.status === "APPROVED") && images.length > 0;
  const failed = session?.status === "FAILED";
  const needsReview = session?.status === "REVIEW_REQUIRED";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Generate product photos with AI Studio"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-sand bg-ivory shadow-[0_24px_60px_-20px_rgba(26,10,0,0.45)] sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-sand/70 px-6 py-5">
          <div className="space-y-1">
            <h3 className="font-display text-display-sm text-ink">AI Studio shoot</h3>
            <p className="text-body-sm text-mist">
              No photos of your own? Add a few of the garment and we&apos;ll create the on-model views for this product.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-mist transition-colors hover:bg-sand/60 hover:text-ink disabled:opacity-40"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Step rail */}
        <ol className="flex items-center gap-3 border-b border-sand/70 px-6 py-3 text-body-xs">
          <StepPip n={1} label="Photos" active={step === "photos"} done={step !== "photos"} />
          <span className="h-px w-6 bg-sand" />
          <StepPip n={2} label="Backdrop" active={step === "backdrop"} done={step === "shoot"} />
          <span className="h-px w-6 bg-sand" />
          <StepPip n={3} label="Review" active={step === "shoot"} done={false} />
        </ol>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === "photos" && (
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
            </section>
          )}

          {step === "backdrop" && (
            <section className="space-y-5">
              <div className="space-y-3">
                <h4 className="text-body-sm font-medium text-ink">Backdrop</h4>
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
                  We&apos;ll create four on-model views — front, back, and both three-quarter angles — from your photos.
                </p>
                <p className="mt-1 text-body-xs text-mist">Takes a minute or two.</p>
              </div>
            </section>
          )}

          {step === "shoot" && (
            <section className="space-y-5">
              {shootRunning && (
                <div className="flex items-center gap-3 rounded-md border border-sand bg-white px-4 py-4">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-ink">Creating your four views…</p>
                    <p className="text-body-xs text-mist">This usually takes a minute or two.</p>
                  </div>
                </div>
              )}

              {failed && (
                <div className="rounded-md border border-coral/40 bg-coral/5 px-4 py-4">
                  <p className="text-body-sm font-medium text-coral">The shoot could not be completed</p>
                  <p className="mt-1 text-body-sm text-ink/80">Please close this and try again with clearer photos.</p>
                </div>
              )}

              {needsReview && (
                <div className="rounded-md border border-gold/40 bg-gold/5 px-4 py-4">
                  <p className="text-body-sm font-medium text-ink">Needs a closer look</p>
                  <p className="mt-1 text-body-sm text-ink/80">
                    These didn&apos;t meet our quality bar automatically, so our team will review them.
                  </p>
                </div>
              )}

              {simulated && images.length > 0 && (
                <p className="rounded-md border border-sand bg-sand/40 px-4 py-2.5 text-body-xs text-mist">
                  Preview mode — placeholder results generated without a connected image provider.
                </p>
              )}

              {(shootRunning && images.length === 0) || images.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {images.length > 0
                    ? images.map((img) => (
                        <figure key={img.id} className="space-y-1.5">
                          <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-sand bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.url} alt={IMAGE_LABEL[img.type] ?? img.type} className="h-full w-full object-cover" />
                          </div>
                          <figcaption className="text-body-xs text-mist">{IMAGE_LABEL[img.type] ?? img.type}</figcaption>
                        </figure>
                      ))
                    : IMAGE_ORDER.map((t) => (
                        <div key={t} className="aspect-[3/4] animate-pulse rounded-md border border-sand bg-sand/50" />
                      ))}
                </div>
              ) : null}

              {ready && (
                <p className="text-body-sm text-ink/80">
                  Use these as this product&apos;s images? You can still add or remove images afterwards.
                </p>
              )}
            </section>
          )}

          {error && <p className="mt-4 rounded-md bg-coral/10 px-4 py-3 text-body-sm text-coral">{error}</p>}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 border-t border-sand/70 px-6 py-4">
          {step === "photos" && (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-md border border-sand px-4 py-2.5 text-body-sm font-medium text-ink transition-colors hover:border-gold/60 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={continueToBackdrop}
                disabled={!hasRequired || busy}
                className="rounded-md bg-ink px-5 py-2.5 text-body-sm font-medium text-gold transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Checking your photos…" : "Continue"}
              </button>
            </>
          )}

          {step === "backdrop" && (
            <>
              <button
                type="button"
                onClick={() => setStep("photos")}
                disabled={busy}
                className="rounded-md border border-sand px-4 py-2.5 text-body-sm font-medium text-ink transition-colors hover:border-gold/60 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={startShoot}
                disabled={busy}
                className="rounded-md bg-ink px-5 py-2.5 text-body-sm font-medium text-gold transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Starting your shoot…" : "Generate shoot"}
              </button>
            </>
          )}

          {step === "shoot" && (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-md border border-sand px-4 py-2.5 text-body-sm font-medium text-ink transition-colors hover:border-gold/60 disabled:opacity-50"
              >
                {ready ? "Discard" : "Close"}
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={!ready || busy}
                className="rounded-md bg-gold px-5 py-2.5 text-body-sm font-medium text-ink transition-colors hover:bg-gold/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Adding…" : "Use these photos"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepPip({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
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
