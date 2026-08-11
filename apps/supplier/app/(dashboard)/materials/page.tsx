import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";

export const metadata: Metadata = { title: "Materials — Luna Supplier" };

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: "bg-sand text-mist",
  ACTIVE: "bg-gold/20 text-gold",
  ARCHIVED: "bg-coral/10 text-coral",
};

type Props = { searchParams: Promise<{ status?: string }> };

export default async function MaterialsPage({ searchParams }: Props) {
  const { status: statusParam } = await searchParams;

  const user = await safeCurrentUser();
  if (!user) return null;
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return null;

  const validStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"];
  const statusFilter = validStatuses.includes(statusParam ?? "")
    ? (statusParam as "DRAFT" | "ACTIVE" | "ARCHIVED")
    : undefined;

  const materials = await prisma.material
    .findMany({
      where: { supplierId: supplier.id, ...(statusFilter ? { status: statusFilter } : {}) },
      orderBy: { updatedAt: "desc" },
    })
    .catch(() => []);

  const tabs = [
    { label: "All", value: undefined },
    { label: "Draft", value: "DRAFT" },
    { label: "Active", value: "ACTIVE" },
    { label: "Archived", value: "ARCHIVED" },
  ] as const;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-md text-ink">Materials</h2>
        <Link href="/materials/new"
          className="rounded-full bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors">
          ＋ Add material
        </Link>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => {
          const active = (t.value ?? undefined) === statusFilter;
          const href = t.value ? `/materials?status=${t.value}` : "/materials";
          return (
            <Link key={t.label} href={href}
              className={`rounded-full px-4 py-1.5 text-body-sm transition-colors ${
                active ? "bg-ink text-ivory" : "border border-sand text-mist hover:border-ink hover:text-ink"
              }`}>
              {t.label}
            </Link>
          );
        })}
      </div>

      {materials.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-ivory py-16 text-center">
          <p className="text-body-md text-ink">No materials yet</p>
          <p className="text-body-sm text-mist mt-1">Add your first fabric, trim, or hardware listing.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {materials.map((m) => (
            <Link key={m.id} href={`/materials/${m.id}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-sand bg-ivory p-5 hover:border-ink transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                {(m.images as string[])?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={(m.images as string[])[0]} alt={m.name} className="h-12 w-12 shrink-0 rounded-lg border border-sand object-cover" />
                )}
                <div className="min-w-0">
                  <p className="text-body-md font-medium text-ink truncate">{m.name}</p>
                  <p className="text-body-xs text-mist capitalize">
                    {m.materialType}{m.color ? ` · ${m.color}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-5 shrink-0">
                <div className="text-right">
                  <p className="text-body-sm text-ink">
                    AED {Number(m.wholesalePrice).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                    <span className="text-mist"> / {m.unit.toLowerCase()}</span>
                  </p>
                  <p className="text-body-xs text-mist">{m.stock} in stock</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-body-xs font-medium ${STATUS_CLASSES[m.status] ?? "bg-sand text-mist"}`}>
                  {m.status.charAt(0) + m.status.slice(1).toLowerCase()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
