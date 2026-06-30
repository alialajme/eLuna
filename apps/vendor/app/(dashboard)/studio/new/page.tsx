"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createStudioUpload,
  triggerStudioPipeline,
} from "../../../actions/studio";

const SLOT_LABELS = ["Front view", "Back view", "Detail / fabric"] as const;

export default function StudioNewPage() {
  const router = useRouter();
  const [files, setFiles] = useState<(File | null)[]>([null, null, null]);
  const [previews, setPreviews] = useState<(string | null)[]>([
    null,
    null,
    null,
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileSelect(index: number, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files are accepted (JPG, PNG, WEBP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`Photo ${index + 1} exceeds 10 MB.`);
      return;
    }
    setError(null);
    const newFiles = [...files];
    newFiles[index] = file;
    setFiles(newFiles);

    const newPreviews = [...previews];
    newPreviews[index] = URL.createObjectURL(file);
    setPreviews(newPreviews);
  }

  async function handleSubmit() {
    if (!files.every(Boolean)) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Upload photos to API route
      const formData = new FormData();
      formData.append("photo0", files[0]!);
      formData.append("photo1", files[1]!);
      formData.append("photo2", files[2]!);

      const uploadRes = await fetch("/api/studio/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Upload failed");
      }

      const { urls } = (await uploadRes.json()) as { urls: string[] };

      // 2. Create DB record
      const result = await createStudioUpload(urls);
      if ("error" in result) throw new Error(result.error);

      const { id } = result;

      // 3. Trigger pipeline (fire-and-forget — don't await)
      triggerStudioPipeline(id).catch(() => {
        // Pipeline errors are stored in generatedAssets and shown on results page
      });

      // 4. Navigate to results
      router.push(`/studio/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setIsLoading(false);
    }
  }

  const allFilled = files.every(Boolean);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="font-display text-display-md text-ink">New Campaign</h2>
        <p className="mt-1 text-body-sm text-mist">
          Upload exactly 3 photos of your abaya — front, back, and a detail
          shot.
        </p>
      </div>

      {/* Upload slots */}
      <div className="grid grid-cols-3 gap-4">
        {SLOT_LABELS.map((label, i) => (
          <label
            key={label}
            className="group relative cursor-pointer"
            aria-label={`Upload ${label}`}
          >
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) =>
                handleFileSelect(i, e.target.files?.[0] ?? null)
              }
              disabled={isLoading}
            />
            <div
              className={`relative flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-lg border-2 transition-colors ${
                previews[i]
                  ? "border-gold"
                  : "border-dashed border-sand hover:border-gold/50"
              } bg-white`}
            >
              {previews[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previews[i]!}
                  alt={label}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl text-sand group-hover:text-gold/50">
                  +
                </span>
              )}
              <p
                className={`absolute bottom-2 text-center text-body-xs font-medium ${previews[i] ? "text-gold" : "text-mist"}`}
              >
                {label}
                {previews[i] ? " ✓" : ""}
              </p>
            </div>
          </label>
        ))}
      </div>

      <p className="text-body-xs text-mist">
        Accepted: JPG, PNG, WEBP · Max 10 MB each
      </p>

      {error && (
        <p className="rounded-lg bg-coral/10 px-4 py-3 text-body-sm text-coral">
          {error}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!allFilled || isLoading}
        className="w-full rounded-full bg-ink py-3 text-body-sm font-medium text-gold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading
          ? "Generating your campaign… this takes about 15 seconds"
          : "Generate Campaign"}
      </button>
    </div>
  );
}
