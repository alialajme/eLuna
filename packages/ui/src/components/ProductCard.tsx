"use client";

import { useState } from "react";

type ProductCardProps = {
  id: string;
  title: string;
  price: number;
  currency?: string;
  imageUrl?: string;
  vendorName?: string;
  isWishlisted?: boolean;
  onWishlistToggle?: (id: string, next: boolean) => void;
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

  function handleWishlist() {
    const next = !wishlisted;
    setWishlisted(next);
    onWishlistToggle?.(id, next);
  }

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-sand bg-ivory transition-shadow hover:shadow-md">
      <div className="relative aspect-[3/4] bg-sand/30">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-mist text-body-sm">
            No image
          </div>
        )}
        <button
          type="button"
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          onClick={handleWishlist}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-ivory/80 text-coral shadow-sm backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100"
        >
          {wishlisted ? "♥" : "♡"}
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
