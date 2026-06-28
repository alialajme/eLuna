"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VariantMatrix, VariantRow } from "./VariantMatrix";
import { createProduct, updateProduct } from "../../../actions/product";

type Status = "DRAFT" | "ACTIVE" | "ARCHIVED";

type InitialData = {
  title: string;
  description: string;
  category: string;
  fabric: string;
  careGuide: string;
  images: string[];
  price: number;
  compareAt?: number;
  status: Status;
  variants: VariantRow[];
};

type Props = {
  productId?: string;
  initialData?: InitialData;
};

const CATEGORIES = [
  { value: "OCCASION", label: "Occasion" },
  { value: "EVERYDAY", label: "Everyday" },
  { value: "TRAVEL", label: "Travel" },
  { value: "SPORT", label: "Sport" },
] as const;

export function ProductForm({ productId, initialData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [category, setCategory] = useState(initialData?.category ?? "OCCASION");
  const [fabric, setFabric] = useState(initialData?.fabric ?? "");
  const [careGuide, setCareGuide] = useState(initialData?.careGuide ?? "");
  const [images, setImages] = useState<string[]>(
    initialData?.images?.length ? initialData.images : [""]
  );
  const [price, setPrice] = useState(initialData?.price ?? 0);
  const [compareAt, setCompareAt] = useState<number | undefined>(
    initialData?.compareAt
  );
  const [status, setStatus] = useState<Status>(initialData?.status ?? "DRAFT");
  const [variants, setVariants] = useState<VariantRow[]>(
    initialData?.variants ?? []
  );

  const addImage = () => {
    if (images.length < 8) setImages([...images, ""]);
  };

  const removeImage = (index: number) => {
    if (images.length === 1) return;
    setImages(images.filter((_, i) => i !== index));
  };

  const updateImage = (index: number, url: string) => {
    setImages(images.map((img, i) => (i === index ? url : img)));
  };

  const handleSubmit = () => {
    setError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2 || trimmedTitle.length > 120) {
      setError("Title must be 2–120 characters");
      return;
    }
    if (!price || price <= 0) {
      setError("Price must be greater than 0");
      return;
    }

    const data = {
      title: trimmedTitle,
      description: description.trim() || undefined,
      category,
      fabric: fabric.trim() || undefined,
      careGuide: careGuide.trim() || undefined,
      images: images.filter((img) => img.trim() !== ""),
      price,
      compareAt: compareAt || undefined,
      status,
      variants: variants.map((v) => ({
        size: v.size,
        color: v.color,
        stock: v.stock,
        price: v.price,
      })),
    };

    startTransition(async () => {
      const result = productId
        ? await updateProduct(productId, data)
        : await createProduct(data);

      if (result.success) {
        router.push("/products");
      } else {
        setError(result.error ?? "Something went wrong");
      }
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      {/* Left column — content fields */}
      <div className="space-y-5">
        {/* Title */}
        <div>
          <label className="block text-body-xs font-medium text-ink mb-1">
            Title <span className="text-coral">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Embroidered Silk Abaya"
            className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-body-xs font-medium text-ink mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Describe the abaya…"
            className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none resize-none"
          />
        </div>

        {/* Category + Fabric */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-body-xs font-medium text-ink mb-1">
              Category <span className="text-coral">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink focus:border-gold focus:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-body-xs font-medium text-ink mb-1">
              Fabric
            </label>
            <input
              type="text"
              value={fabric}
              onChange={(e) => setFabric(e.target.value)}
              placeholder="e.g. 100% Silk"
              className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none"
            />
          </div>
        </div>

        {/* Care Guide */}
        <div>
          <label className="block text-body-xs font-medium text-ink mb-1">
            Care Guide
          </label>
          <textarea
            value={careGuide}
            onChange={(e) => setCareGuide(e.target.value)}
            rows={2}
            placeholder="e.g. Dry clean only"
            className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none resize-none"
          />
        </div>

        {/* Images */}
        <div>
          <label className="block text-body-xs font-medium text-ink mb-2">
            Images (URLs)
          </label>
          <div className="space-y-2">
            {images.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => updateImage(i, e.target.value)}
                  placeholder="https://…"
                  className="flex-1 rounded-lg border border-sand bg-ivory px-3 py-2 text-body-sm text-ink placeholder:text-mist focus:border-gold focus:outline-none"
                />
                {url.trim() && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt=""
                    className="h-10 w-10 rounded object-cover border border-sand"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  disabled={images.length === 1}
                  className="text-mist hover:text-coral transition-colors disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          {images.length < 8 && (
            <button
              type="button"
              onClick={addImage}
              className="mt-2 text-body-xs text-gold hover:underline"
            >
              + Add image
            </button>
          )}
        </div>
      </div>

      {/* Right sidebar — commerce fields */}
      <div className="space-y-5">
        {/* Price */}
        <div>
          <label className="block text-body-xs font-medium text-ink mb-1">
            Price (AED) <span className="text-coral">*</span>
          </label>
          <input
            type="number"
            min={1}
            step={0.01}
            value={price || ""}
            onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none"
          />
        </div>

        {/* Compare-at price */}
        <div>
          <label className="block text-body-xs font-medium text-ink mb-1">
            Compare-at Price (AED)
          </label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={compareAt ?? ""}
            onChange={(e) =>
              setCompareAt(e.target.value ? parseFloat(e.target.value) : undefined)
            }
            placeholder="Optional"
            className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-body-xs font-medium text-ink mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink focus:border-gold focus:outline-none"
          >
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>

        {/* Variants */}
        <div className="rounded-lg border border-sand bg-ivory p-4">
          <h3 className="text-body-xs font-medium text-ink mb-3">Variants</h3>
          <VariantMatrix value={variants} onChange={setVariants} />
        </div>

        {/* Save button */}
        {error && (
          <p className="text-body-sm text-coral">{error}</p>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full rounded-full bg-gold px-4 py-2.5 text-body-md font-medium text-ink hover:bg-gold/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Saving…" : "Save product"}
        </button>
      </div>
    </div>
  );
}
