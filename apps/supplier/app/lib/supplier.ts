import { prisma } from "@e-luna/db";
import type { SupplierStatus } from "@e-luna/db";

export type SupplierWithStatus = {
  id: string;
  userId: string;
  companyName: string;
  companySlug: string;
  status: SupplierStatus;
  description: string | null;
  logoUrl: string | null;
  materialTypes: string[];
  ibanNumber: string | null;
};

export async function getSupplierByUserId(
  userId: string
): Promise<SupplierWithStatus | null> {
  return prisma.supplier
    .findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        companyName: true,
        companySlug: true,
        status: true,
        description: true,
        logoUrl: true,
        materialTypes: true,
        ibanNumber: true,
      },
    })
    .catch(() => null);
}
