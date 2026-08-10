"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMaterial,
  updateMaterial,
  archiveMaterial,
  deleteMaterial,
  type MaterialData,
} from "../../actions/material";
import { MATERIAL_TYPES, MATERIAL_UNITS } from "../../lib/materials";

export type MaterialFormInitial = MaterialData & { id: string; archived?: boolean };

type Props = {
  initial?: MaterialFormInitial;
};

const inputCls =
  "w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink";
const labelCls = "text-label text-mist block mb-2";

export function MaterialForm({ initial }: Props) {
  const router = useRouter();
  const isEdit = !!initial;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [materialType, setMaterialType] = useState<string>(
    initial?.materialType ?? MATERIAL_TYPES[0].value
  );
  const [color, setColor] = useState(initial?.color ?? "");
  const [composition, setComposition] = useState(initial?.composition ?? "");
  const [unit, setUnit] = useState<string>(initial?.unit ?? MATERIAL_UNITS[0].value);
  const [wholesalePrice, setWholesalePrice] = useState(
    initial ? String(initial.wholesalePrice) : ""
  );
  const [moq, setMoq] = useState(initial ? String(initial.moq) : "1");
  const [stock, setStock] = useState(initial ? String(initial.stock) : "0");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imagesText, setImagesText] = useState((initial?.images ?? []).join("\n"));
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE">(initial?.status ?? "DRAFT");

  function buildData(): MaterialData {
    return {
      name,
      materialType,
      color: color || undefined,
      composition: composition || undefined,
      unit: unit as MaterialData["unit"],
      wholesalePrice: Number(wholesalePrice),
      moq: Number(moq),
      stock: Number(stock),
      description: description || undefined,
      images: imagesText.split("\n").map((s) => s.trim()).filter(Boolean),
      status,
    };
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const data = buildData();
      const result = isEdit
        ? await updateMaterial(initial!.id, data)
        : await createMaterial(data);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.push("/materials");
      router.refresh();
    });
  }

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveMaterial(initial!.id);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.push("/materials");
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("Delete this material permanently?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteMaterial(initial!.id);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.push("/materials");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="m-name" className={labelCls}>NAME</label>
        <input id="m-name" className={inputCls} value={name} maxLength={80}
          onChange={(e) => setName(e.target.value)} placeholder="e.g. Black Nida Crepe" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="m-type" className={labelCls}>TYPE</label>
          <select id="m-type" className={inputCls} value={materialType}
            onChange={(e) => setMaterialType(e.target.value)}>
            {MATERIAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="m-unit" className={labelCls}>UNIT OF SALE</label>
          <select id="m-unit" className={inputCls} value={unit}
            onChange={(e) => setUnit(e.target.value)}>
            {MATERIAL_UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="m-color" className={labelCls}>COLOR (OPTIONAL)</label>
          <input id="m-color" className={inputCls} value={color}
            onChange={(e) => setColor(e.target.value)} placeholder="e.g. Jet black" />
        </div>
        <div>
          <label htmlFor="m-comp" className={labelCls}>COMPOSITION (OPTIONAL)</label>
          <input id="m-comp" className={inputCls} value={composition}
            onChange={(e) => setComposition(e.target.value)} placeholder="e.g. 100% viscose" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="m-price" className={labelCls}>WHOLESALE PRICE (AED)</label>
          <input id="m-price" type="number" min="0.01" step="0.01" className={inputCls}
            value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label htmlFor="m-moq" className={labelCls}>MIN ORDER QTY</label>
          <input id="m-moq" type="number" min="1" step="1" className={inputCls}
            value={moq} onChange={(e) => setMoq(e.target.value)} />
        </div>
        <div>
          <label htmlFor="m-stock" className={labelCls}>STOCK</label>
          <input id="m-stock" type="number" min="0" step="1" className={inputCls}
            value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
      </div>

      <div>
        <label htmlFor="m-desc" className={labelCls}>DESCRIPTION (OPTIONAL)</label>
        <textarea id="m-desc" rows={3} className={`${inputCls} resize-none`} value={description}
          maxLength={600} onChange={(e) => setDescription(e.target.value)}
          placeholder="Weight, width, sourcing notes…" />
      </div>

      <div>
        <label htmlFor="m-images" className={labelCls}>IMAGE URLS — ONE PER LINE (OPTIONAL)</label>
        <textarea id="m-images" rows={3} className={`${inputCls} resize-none font-mono text-body-sm`}
          value={imagesText} onChange={(e) => setImagesText(e.target.value)}
          placeholder="https://example.com/swatch.jpg" />
      </div>

      <div>
        <span className={labelCls}>STATUS</span>
        <div className="flex gap-2">
          {(["DRAFT", "ACTIVE"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)}
              className={`rounded-full border px-4 py-2 text-body-sm transition-colors ${
                status === s ? "border-ink bg-ink text-ivory" : "border-sand text-mist hover:border-ink hover:text-ink"
              }`}>
              {s === "DRAFT" ? "Draft" : "Active"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-sm text-coral">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button type="button" onClick={handleSubmit} disabled={isPending || !name.trim()}
          className="rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50">
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create material"}
        </button>
        {isEdit && (
          <>
            {!initial!.archived && (
              <button type="button" onClick={handleArchive} disabled={isPending}
                className="rounded-full border border-sand px-5 py-3 text-body-sm text-mist hover:border-ink hover:text-ink transition-colors disabled:opacity-50">
                Archive
              </button>
            )}
            <button type="button" onClick={handleDelete} disabled={isPending}
              className="rounded-full bg-coral/10 px-5 py-3 text-body-sm font-medium text-coral hover:bg-coral/20 transition-colors disabled:opacity-50">
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
