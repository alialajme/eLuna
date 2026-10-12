import { prisma } from "@ayvana/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const cats = await prisma.caseCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, slug: true },
  });
  return Response.json({ categories: cats });
}
