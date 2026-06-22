"use client";

import { useState, useRef, useEffect } from "react";
import { ProductGallery, SizeSelector } from "@e-luna/ui";
import type { SizeProfile } from "@e-luna/db";
import { addToCart } from "../../actions/cart";

type Variant = {
  id: string;
  size: string;
  color: string;
  stock: number;
};

type ProductDetailProps = {
  images: string[];
  title: string;
  price: number;
  fabric: string | null;
  sizeGuide: {
    entries: { size: string; bust: [number, number]; waist: [number, number]; hip: [number, number]; length: number }[];
  } | null;
  variants: Variant[];
  sizeProfile: Pick<SizeProfile, "usualSize" | "bust" | "fitPreference"> | null;
  recommendedSize: string | null;
};

export function ProductDetail({
  images,
  title,
  price,
  fabric,
  sizeGuide,
  variants,
  sizeProfile,
  recommendedSize,
}: ProductDetailProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedSize, setSelectedSize] = useState<string | null>(recommendedSize ?? null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [wishlisted, setWishlisted] = useState(false);

  const variantStocks = variants.map((v) => ({
    size: v.size,
    stock: v.stock,
    variantId: v.id,
  }));

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleAddToBag() {
    if (!selectedVariantId || adding) return;
    setAdding(true);
    try {
      const result = await addToCart(selectedVariantId, 1);
      setAddedMessage(result.message);
      timeoutRef.current = setTimeout(() => setAddedMessage(null), 3000);
    } catch {
      setAddedMessage("Could not add to bag. Please try again.");
      timeoutRef.current = setTimeout(() => setAddedMessage(null), 3000);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      {/* Gallery */}
      <ProductGallery images={images} title={title} />

      {/* Info */}
      <div className="flex flex-col gap-6 py-2">
        <div>
          <p className="font-sans text-body-md font-semibold text-gold">
            AED {price.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <h1 className="font-display text-display-md text-ink mt-1">{title}</h1>
          {fabric && (
            <span className="mt-2 inline-block rounded-full border border-sand px-3 py-1 text-body-sm text-mist">
              {fabric}
            </span>
          )}
        </div>

        {/* Size selector */}
        <SizeSelector
          variants={variantStocks}
          selectedSize={selectedSize}
          recommendedSize={recommendedSize ?? undefined}
          onSelect={(size, variantId) => {
            setSelectedSize(size);
            setSelectedVariantId(variantId);
          }}
        />

        {/* Luna Fit strip */}
        {sizeProfile ? (
          recommendedSize ? (
            <div className="rounded-xl bg-ink px-4 py-3 text-body-sm text-ivory">
              <span className="text-gold">◑</span> Luna thinks{" "}
              <strong>{recommendedSize}</strong> fits you well based on your measurements.
            </div>
          ) : null
        ) : (
          <div className="rounded-xl border border-sand px-4 py-3 text-body-sm text-mist">
            <a href="/profile/size" className="text-gold underline">
              Add your measurements
            </a>{" "}
            for a personalised size recommendation.
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleAddToBag}
            disabled={!selectedVariantId || adding}
            className="flex-1 rounded-full bg-ink py-4 text-body-md font-semibold text-ivory transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {adding ? "Adding…" : addedMessage ?? "Add to Bag"}
          </button>

          <button
            type="button"
            onClick={() => setWishlisted((prev) => !prev)}
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-sand text-coral hover:bg-sand transition-colors"
          >
            {wishlisted ? "♥" : "♡"}
          </button>
        </div>

        {/* Size guide accordion */}
        {sizeGuide?.entries?.length ? (
          <details className="group">
            <summary className="cursor-pointer list-none border-t border-sand pt-4 text-body-md font-medium text-ink">
              Size guide{" "}
              <span className="text-mist group-open:hidden">+</span>
              <span className="text-mist hidden group-open:inline">−</span>
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-sand text-left text-label uppercase text-mist">
                    <th className="py-2 pr-4">Size</th>
                    <th className="py-2 pr-4">Bust (cm)</th>
                    <th className="py-2 pr-4">Waist (cm)</th>
                    <th className="py-2 pr-4">Hip (cm)</th>
                    <th className="py-2">Length (cm)</th>
                  </tr>
                </thead>
                <tbody>
                  {sizeGuide.entries.map((entry) => (
                    <tr key={entry.size} className={`border-b border-sand/50 ${selectedSize === entry.size ? "bg-gold/10" : ""}`}>
                      <td className="py-2 pr-4 font-medium text-ink">{entry.size}</td>
                      <td className="py-2 pr-4 text-mist">{entry.bust[0]}–{entry.bust[1]}</td>
                      <td className="py-2 pr-4 text-mist">{entry.waist[0]}–{entry.waist[1]}</td>
                      <td className="py-2 pr-4 text-mist">{entry.hip[0]}–{entry.hip[1]}</td>
                      <td className="py-2 text-mist">{entry.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
