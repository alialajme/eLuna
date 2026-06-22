"use client";

type VariantStock = {
  size: string;
  stock: number;
  variantId: string;
};

type SizeSelectorProps = {
  variants: VariantStock[];
  selectedSize: string | null;
  recommendedSize?: string | null;
  onSelect: (size: string, variantId: string) => void;
};

export function SizeSelector({
  variants,
  selectedSize,
  recommendedSize,
  onSelect,
}: SizeSelectorProps) {
  const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
  const uniqueSizes = sizeOrder.filter((s) => variants.some((v) => v.size === s));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-label uppercase text-mist">Size</span>
        {recommendedSize && (
          <span className="text-body-sm text-gold">✦ Your size: {recommendedSize}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {uniqueSizes.map((size) => {
          const variant = variants.find((v) => v.size === size);
          const stock = variant?.stock ?? 0;
          const isOutOfStock = stock === 0;
          const isSelected = selectedSize === size;
          const isRecommended = recommendedSize === size;
          const isLowStock = stock > 0 && stock <= 5;

          return (
            <div key={size} className="relative">
              <button
                onClick={() => !isOutOfStock && variant && onSelect(size, variant.variantId)}
                disabled={isOutOfStock}
                aria-label={`Size ${size}${isOutOfStock ? " — out of stock" : ""}${isRecommended ? " — recommended for you" : ""}`}
                className={`relative h-11 min-w-[3rem] rounded-lg px-3 text-body-md font-medium transition-all ${
                  isSelected && isRecommended
                    ? "bg-ink text-ivory border-2 border-gold"
                    : isSelected
                    ? "bg-ink text-ivory"
                    : isOutOfStock
                    ? "cursor-not-allowed border border-sand text-mist line-through opacity-50"
                    : isRecommended
                    ? "border-2 border-gold text-ink hover:bg-sand"
                    : "border border-sand text-ink hover:bg-sand"
                }`}
              >
                {size}
                {isRecommended && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-gold" />
                )}
              </button>
              {isLowStock && !isOutOfStock && (
                <span className="absolute -bottom-4 left-0 whitespace-nowrap text-body-sm text-coral">
                  Only {stock} left
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
