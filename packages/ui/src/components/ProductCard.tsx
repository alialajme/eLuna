"use client";

import { useState, useEffect } from "react";

type ProductCardProps = {
  id: string;
  title: string;
  price: number;
  currency?: string;
  imageUrl?: string;
  vendorName?: string;
  isWishlisted?: boolean;
  onWishlistToggle?: (id: string, next: boolean) => void | Promise<void>;
};

export function ProductCard({
  id,
  title,
  price,
  currency = "AED",
  imageUrl,
  vendorName,
  isWishlisted = false,
  onWishlistToggle,
}: ProductCardProps) {
  const [wishlisted, setWishlisted] = useState(isWishlisted);
  const [isLoading, setIsLoading] = useState(false);

  // Sync with external prop changes (e.g., parent refetch)
  useEffect(() => {
    setWishlisted(isWishlisted);
  }, [isWishlisted]);

  async function handleWishlist() {
    if (isLoading) return;
    const next = !wishlisted;
    setWishlisted(next); // optimistic
    setIsLoading(true);
    try {
      await onWishlistToggle?.(id, next);
    } catch {
      setWishlisted(!next); // rollback on error
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-sand bg-ivory transition-shadow hover:shadow-md">
      <div className="relative aspect-[3/4] bg-sand/30">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            width={300}
            height={400}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-mist text-body-sm">
            No image
          </div>
        )}
        {/* Always visible on mobile, hover-reveal on desktop */}
        <button
          type="button"
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          disabled={isLoading}
          onClick={handleWishlist}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-ivory/80 text-coral shadow-sm backdrop-blur-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100 disabled:cursor-not-allowed"
        >
          {isLoading ? "…" : wishlisted ? "♥" : "♡"}
        </button>
      </div>
      <div className="p-4">
        {vendorName && (
          <p className="text-label uppercase text-mist">{vendorName}</p>
        )}
        <p className="mt-1 font-sans text-body-md font-medium text-ink line-clamp-2">{title}</p>
        <p className="mt-2 font-display text-body-lg font-semibold text-gold">
          {currency} {price.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
        </p>
      </div>
    </article>
  );
}
