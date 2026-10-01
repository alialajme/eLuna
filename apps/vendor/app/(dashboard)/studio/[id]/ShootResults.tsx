"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Asset = { id: string; type: string; url: string; isSimulated: boolean };
type Job = { id: string; kind: string; state: string; error: string | null };
type Session = {
  id: string;
  status: string;
  garmentId: string;
  productId: string | null;
  createdAt: string;
  jobs: Job[];
  assets: Asset[];
};

const TERMINAL = new Set(["PREVIEW", "APPROVED", "PUBLISHED", "FAILED", "REVIEW_REQUIRED", "CANCELLED"]);

// Seller-facing stage copy — no AI jargon, maps the job state machine to a human line.
const STAGE_COPY: Record<string, string> = {
  QUEUED: "Getting ready…",
  VALIDATING: "Checking your photos…",
  ANALYZING: "Studying the garment…",
  GENERATING_IMAGES: "Creating your four views…",
  VALIDATING_IMAGES: "Reviewing the results…",
  GENERATING_VIDEO: "Adding the turntable…",
  VALIDATING_VIDEO: "Final checks…",
  COMPLETED: "Done",
};

const IMAGE_ORDER = ["IMAGE_FRONT", "IMAGE_34_FRONT", "IMAGE_34_BACK", "IMAGE_BACK"];
const IMAGE_LABEL: Record<string, string> = {
  IMAGE_FRONT: "Front",
  IMAGE_34_FRONT: "Three-quarter front",
  IMAGE_34_BACK: "Three-quarter back",
  IMAGE_BACK: "Back",
};

export function ShootResults({
  initial,
  product,
}: {
  initial: Session;
  product: { id: string; title: string } | null;
}) {
  const [session, setSession] = useState<Session>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (TERMINAL.has(session.status)) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/v1/ai-studio/generations/${initial.id}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { session: Session };
          if (!cancelled && body.session) setSession(body.session);
          if (!cancelled && !TERMINAL.has(body.session.status)) {
            timer.current = setTimeout(poll, 2500);
          }
        } else if (!cancelled) {
          timer.current = setTimeout(poll, 4000);
        }
      } catch {
        if (!cancelled) timer.current = setTimeout(poll, 4000);
      }
    }

    timer.current = setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [initial.id, session.status]);

  const activeJob = session.jobs.find((j) => !["COMPLETED", "FAILED", "REVIEW_REQUIRED", "CANCELLED"].includes(j.state));
  const images = session.assets
    .filter((a) => a.type !== "VIDEO_TURNTABLE")
    .sort((a, b) => IMAGE_ORDER.indexOf(a.type) - IMAGE_ORDER.indexOf(b.type));
  const simulated = images.some((a) => a.isSimulated);
  const running = !TERMINAL.has(session.status);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">Your shoot</h2>
          <p className="mt-1 text-body-sm text-mist">
            Started{" "}
            {new Date(session.createdAt).toLocaleDateString("en-AE", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
          {product && (
            <p className="mt-1 text-body-sm text-ink/80">
              For{" "}
              <Link href={`/products/${product.id}`} className="text-gold hover:underline">
                {product.title}
              </Link>
            </p>
          )}
        </div>
        <Link href="/studio" className="text-body-sm text-gold hover:underline">
          All shoots
        </Link>
      </div>

      {running && (
        <div className="flex items-center gap-3 rounded-md border border-sand bg-white px-4 py-4">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold" />
          </span>
          <div className="min-w-0">
            <p className="text-body-sm font-medium text-ink">
              {STAGE_COPY[activeJob?.state ?? "QUEUED"] ?? "Working…"}
            </p>
            <p className="text-body-xs text-mist">This usually takes a minute or two.</p>
          </div>
        </div>
      )}

      {session.status === "FAILED" && (
        <div className="rounded-md border border-coral/40 bg-coral/5 px-4 py-4">
          <p className="text-body-sm font-medium text-coral">The shoot could not be completed</p>
          <p className="mt-1 text-body-sm text-ink/80">
            {session.jobs.find((j) => j.error)?.error ?? "Something went wrong. Please try again."}
          </p>
          <Link href="/studio/new" className="mt-3 inline-block text-body-sm text-gold hover:underline">
            Start a new shoot
          </Link>
        </div>
      )}

      {session.status === "REVIEW_REQUIRED" && (
        <div className="rounded-md border border-gold/40 bg-gold/5 px-4 py-4">
          <p className="text-body-sm font-medium text-ink">Needs a closer look</p>
          <p className="mt-1 text-body-sm text-ink/80">
            The results did not meet our quality bar automatically, so our team will review them. We will let you know
            shortly.
          </p>
        </div>
      )}

      {simulated && images.length > 0 && (
        <p className="rounded-md border border-sand bg-sand/40 px-4 py-2.5 text-body-xs text-mist">
          Preview mode — these are placeholder results generated without a connected image provider.
        </p>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {images.map((img) => (
            <figure key={img.id} className="space-y-1.5">
              <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-sand bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={IMAGE_LABEL[img.type] ?? img.type} className="h-full w-full object-cover" />
                {img.isSimulated && (
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ivory">
                    Preview
                  </span>
                )}
              </div>
              <figcaption className="text-body-xs text-mist">{IMAGE_LABEL[img.type] ?? img.type}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {running && images.length === 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {IMAGE_ORDER.map((t) => (
            <div key={t} className="aspect-[3/4] animate-pulse rounded-md border border-sand bg-sand/50" />
          ))}
        </div>
      )}
    </div>
  );
}
