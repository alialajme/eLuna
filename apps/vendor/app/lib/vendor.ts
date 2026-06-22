import { prisma } from "@e-luna/db";

export type VendorWithStatus = {
  id: string;
  userId: string;
  storeName: string;
  storeSlug: string;
  status: string;
  description: string | null;
  logoUrl: string | null;
  ibanNumber: string | null;
};

export async function getVendorByUserId(
  userId: string
): Promise<VendorWithStatus | null> {
  return prisma.vendor
    .findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        storeName: true,
        storeSlug: true,
        status: true,
        description: true,
        logoUrl: true,
        ibanNumber: true,
      },
    })
    .catch(() => null);
}
