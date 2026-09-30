import { prisma } from "@ayvana/db";

// The mobile app has no auth wired yet (Clerk keys absent in this setup), so
// it operates as a single demo customer. Resolve the seeded customer, falling
// back to any customer profile so the endpoints work on a fresh DB.
export async function resolveMobileCustomer() {
  const userId = process.env.DEMO_USER_ID || "user_seed_customer_sara";
  return (
    (await prisma.customerProfile.findFirst({ where: { userId }, include: { user: true } })) ??
    (await prisma.customerProfile.findFirst({ include: { user: true } }))
  );
}
