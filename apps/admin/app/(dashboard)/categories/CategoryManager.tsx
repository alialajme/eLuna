"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCategory, updateCategory, deleteCategory } from "../../actions/categories";

type Category = { id: string; name: string; slug: string; sortOrder: number; isActive: boolean };
type Props = { categories: Category[] };

export function CategoryManager({ categories }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const run = (fn: () => Promise<{ success: true } | { error: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if ("error" in r) {
        setError(r.error);
        return;
      }
      after?.();
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-sand bg-ivory p-4">
        <p className="mb-2 text-body-sm font-medium text-ink">Add category</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="rounded-lg border border-sand bg-white px-3 py-2 text-body-sm text-ink"
          />
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="slug (optional)"
            className="rounded-lg border border-sand bg-white px-3 py-2 text-body-sm text-ink"
          />
          <button
            type="button"
            disabled={isPending || !newName.trim()}
            onClick={() =>
              run(() => createCategory({ name: newName, slug: newSlug || undefined }), () => {
                setNewName("");
                setNewSlug("");
              })
            }
            className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-sage hover:text-ink disabled:opacity-50 transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <p className="text-body-md text-mist">No categories yet — using the built-in defaults on the storefront until you add some.</p>
      ) : (
        <div className="space-y-2">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} isPending={isPending} run={run} />
          ))}
        </div>
      )}

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}

function CategoryRow({
  category,
  isPending,
  run,
}: {
  category: Category;
  isPending: boolean;
  run: (fn: () => Promise<{ success: true } | { error: string }>, after?: () => void) => void;
}) {
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sand bg-ivory p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-36 rounded-lg border border-sand bg-white px-3 py-1.5 text-body-sm text-ink"
      />
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        className="w-36 rounded-lg border border-sand bg-white px-3 py-1.5 text-body-sm text-ink"
      />
      <input
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
        className="w-16 rounded-lg border border-sand bg-white px-2 py-1.5 text-body-sm text-ink"
      />
      <label className="flex items-center gap-1 text-body-xs text-ink">
        <input
          type="checkbox"
          checked={category.isActive}
          onChange={(e) => run(() => updateCategory(category.id, { isActive: e.target.checked }))}
          className="accent-sage"
        />
        Active
      </label>
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => updateCategory(category.id, { name, slug, sortOrder: Number(sortOrder) || 0 }))}
        className="rounded-full bg-ink px-3 py-1.5 text-body-xs font-medium text-ivory hover:bg-sage hover:text-ink disabled:opacity-50 transition-colors"
      >
        Save
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => deleteCategory(category.id))}
        className="rounded-full border border-sand px-3 py-1.5 text-body-xs font-medium text-ink hover:border-coral hover:text-coral disabled:opacity-50 transition-colors"
      >
        Delete
      </button>
    </div>
  );
}
