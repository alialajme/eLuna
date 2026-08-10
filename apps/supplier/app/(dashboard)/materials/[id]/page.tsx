import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getSupplierByUserId } from "../../../lib/supplier";
import { MaterialForm, type MaterialFormInitial } from "../../components/MaterialForm";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const material = await prisma.material
    .findUnique({ where: { id }, select: { name: true } })
    .catch(() => null);
  return { title: material ? `${material.name} — Luna Supplier` : "Edit material — Luna Supplier" };
}

export default async function EditMaterialPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) redirect("/");

  const material = await prisma.material
    .findUnique({ where: { id } })
    .catch(() => null);

  if (!material || material.supplierId !== supplier.id) notFound();

  const initial: MaterialFormInitial = {
    id: material.id,
    name: material.name,
    materialType: material.materialType,
    color: material.color ?? undefined,
    composition: material.composition ?? undefined,
    unit: material.unit,
    wholesalePrice: Number(material.wholesalePrice),
    moq: material.moq,
    stock: material.stock,
    description: material.description ?? undefined,
    images: (material.images as string[]) ?? [],
    status: material.status === "ARCHIVED" ? "DRAFT" : material.status,
    archived: material.status === "ARCHIVED",
  };

  return (
    <div className="max-w-3xl">
      <h2 className="font-display text-display-md text-ink mb-6">Edit material</h2>
      <MaterialForm initial={initial} />
    </div>
  );
}
