import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { PlaceOrderForm } from "../../components/PlaceOrderForm";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const material = await prisma.material
    .findUnique({ where: { id }, select: { name: true } })
    .catch(() => null);
  return { title: material ? `${material.name} — Sourcing` : "Sourcing — Luna Vendor" };
}

export default async function SourcingMaterialPage({ params }: Props) {
  const { id } = await params;

  const material = await prisma.material
    .findUnique({
      where: { id },
      include: { supplier: { select: { companyName: true, status: true } } },
    })
    .catch(() => null);

  if (!material || material.status !== "ACTIVE" || material.supplier.status !== "ACTIVE") notFound();

  const images = (material.images as string[]) ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/sourcing" className="text-body-sm text-mist hover:text-ink">← Back to sourcing</Link>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-display-md text-ink">{material.name}</h2>
            <p className="text-body-sm text-mist capitalize">
              {material.materialType}{material.color ? ` · ${material.color}` : ""}
            </p>
            <p className="text-body-sm text-mist mt-1">Supplied by {material.supplier.companyName}</p>
          </div>
          {material.composition && (
            <p className="text-body-sm text-ink"><span className="text-mist">Composition: </span>{material.composition}</p>
          )}
          {material.description && <p className="text-body-md text-ink">{material.description}</p>}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={material.name} className="h-24 w-24 rounded-lg object-cover border border-sand" />
              ))}
            </div>
          )}
        </div>

        <PlaceOrderForm
          materialId={material.id}
          moq={material.moq}
          stock={material.stock}
          unitPrice={Number(material.wholesalePrice)}
          unit={material.unit}
        />
      </div>
    </div>
  );
}
