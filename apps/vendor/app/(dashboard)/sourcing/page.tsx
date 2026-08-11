import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";

export const metadata: Metadata = { title: "Sourcing — Luna Vendor" };

const TYPES = [
  { label: "All", value: undefined },
  { label: "Fabric", value: "fabric" },
  { label: "Trim", value: "trim" },
  { label: "Lining", value: "lining" },
  { label: "Thread", value: "thread" },
  { label: "Hardware", value: "hardware" },
] as const;

type Props = { searchParams: Promise<{ type?: string }> };

export default async function SourcingPage({ searchParams }: Props) {
  const { type } = await searchParams;
  const typeFilter = TYPES.some((t) => t.value === type) ? type : undefined;

  const materials = await prisma.material
    .findMany({
      where: {
        status: "ACTIVE",
        supplier: { status: "ACTIVE" },
        ...(typeFilter ? { materialType: typeFilter } : {}),
      },
      include: { supplier: { select: { companyName: true } } },
      orderBy: { updatedAt: "desc" },
    })
    .catch(() => []);

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h2 className="font-display text-display-md text-ink">Sourcing</h2>
        <p className="text-body-sm text-mist">Order fabrics, trims, and hardware from Luna suppliers.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => {
          const active = (t.value ?? undefined) === typeFilter;
          const href = t.value ? `/sourcing?type=${t.value}` : "/sourcing";
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
          <p className="text-body-md text-ink">No materials available</p>
          <p className="text-body-sm text-mist mt-1">Check back soon — suppliers are still listing stock.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {materials.map((m) => (
            <Link key={m.id} href={`/sourcing/${m.id}`}
              className="rounded-2xl border border-sand bg-ivory p-5 hover:border-ink transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {(m.images as string[])?.[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={(m.images as string[])[0]} alt={m.name} className="h-14 w-14 shrink-0 rounded-lg border border-sand object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="text-body-md font-medium text-ink truncate">{m.name}</p>
                    <p className="text-body-xs text-mist capitalize">
                      {m.materialType}{m.color ? ` · ${m.color}` : ""}
                    </p>
                    <p className="text-body-xs text-mist mt-1">{m.supplier.companyName}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-body-sm text-ink">
                    AED {Number(m.wholesalePrice).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                    <span className="text-mist"> / {m.unit.toLowerCase()}</span>
                  </p>
                  <p className="text-body-xs text-mist">MOQ {m.moq} · {m.stock} in stock</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
