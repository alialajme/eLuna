"use client";

import { useState, KeyboardEvent } from "react";

export type VariantRow = {
  size: string;
  color: string;
  stock: number;
  price?: number;
  hasOrders: boolean;
};

type Props = {
  value: VariantRow[];
  onChange: (variants: VariantRow[]) => void;
};

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const tag = input.trim();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-sand bg-ivory p-2 min-h-[40px]">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 text-body-xs text-ink"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-mist hover:text-ink leading-none"
          >
            ✕
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[80px] bg-transparent text-body-sm text-ink outline-none placeholder:text-mist"
      />
    </div>
  );
}

export function VariantMatrix({ value, onChange }: Props) {
  const [sizes, setSizes] = useState<string[]>(() => [
    ...new Set(value.map((v) => v.size)),
  ]);
  const [colors, setColors] = useState<string[]>(() => [
    ...new Set(value.map((v) => v.color)),
  ]);

  const generate = () => {
    const rows: VariantRow[] = [];
    for (const size of sizes) {
      for (const color of colors) {
        const existing = value.find((v) => v.size === size && v.color === color);
        rows.push({
          size,
          color,
          stock: existing?.stock ?? 0,
          price: existing?.price,
          hasOrders: existing?.hasOrders ?? false,
        });
      }
    }
    onChange(rows);
  };

  const updateRow = (
    index: number,
    field: "stock" | "price",
    val: number | undefined
  ) => {
    onChange(value.map((row, i) => (i === index ? { ...row, [field]: val } : row)));
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-body-xs font-medium text-ink mb-1">Sizes</p>
        <TagInput tags={sizes} onChange={setSizes} placeholder="S, M, L, XL…" />
      </div>

      <div>
        <p className="text-body-xs font-medium text-ink mb-1">Colors</p>
        <TagInput tags={colors} onChange={setColors} placeholder="Black, Camel…" />
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={sizes.length === 0 || colors.length === 0}
        className="w-full rounded-lg border border-gold px-3 py-2 text-body-sm text-gold hover:bg-gold/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Generate combinations
      </button>

      {value.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-body-xs">
            <thead>
              <tr className="border-b border-sand">
                <th className="pb-1 text-left text-mist font-normal">Size</th>
                <th className="pb-1 text-left text-mist font-normal">Color</th>
                <th className="pb-1 text-left text-mist font-normal">Stock</th>
                <th className="pb-1 text-left text-mist font-normal">Price</th>
                <th className="pb-1"></th>
              </tr>
            </thead>
            <tbody>
              {value.map((row, i) => (
                <tr
                  key={`${row.size}-${row.color}`}
                  className="border-b border-sand/50"
                >
                  <td className="py-1 pr-2 text-ink">{row.size}</td>
                  <td className="py-1 pr-2 text-ink">{row.color}</td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min={0}
                      value={row.stock}
                      onChange={(e) =>
                        updateRow(i, "stock", parseInt(e.target.value) || 0)
                      }
                      className="w-14 rounded border border-sand bg-white px-1.5 py-0.5 text-body-xs text-ink"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={row.price ?? ""}
                      onChange={(e) =>
                        updateRow(
                          i,
                          "price",
                          e.target.value ? parseFloat(e.target.value) : undefined
                        )
                      }
                      placeholder="—"
                      className="w-16 rounded border border-sand bg-white px-1.5 py-0.5 text-body-xs text-ink placeholder:text-mist"
                    />
                  </td>
                  <td className="py-1">
                    {row.hasOrders ? (
                      <span className="text-mist text-body-xs" title="Has order history — cannot remove">
                        🔒
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-mist hover:text-coral transition-colors text-body-xs"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
