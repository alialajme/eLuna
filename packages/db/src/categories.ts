import { prisma } from "./client";

export type CategoryDTO = { name: string; slug: string };

export const DEFAULT_CATEGORIES: CategoryDTO[] = [
  { name: "Occasion", slug: "occasion" },
  { name: "Everyday", slug: "everyday" },
  { name: "Travel", slug: "travel" },
  { name: "Sport", slug: "sport" },
];

export async function getCategories(): Promise<CategoryDTO[]> {
  const rows = await prisma.category
    .findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { name: true, slug: true },
    })
    .catch(() => [] as CategoryDTO[]);
  return rows.length > 0 ? rows : DEFAULT_CATEGORIES;
}

export async function getAllCategories() {
  return prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }).catch(() => []);
}
