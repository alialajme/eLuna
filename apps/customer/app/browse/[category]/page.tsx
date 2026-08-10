import { notFound } from "next/navigation";
import { getCategories } from "@e-luna/db";
import BrowsePage from "../page";

type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { category } = await params;
  const label = category.charAt(0).toUpperCase() + category.slice(1);
  return {
    title: `${label} Abayas — Luna`,
    description: `Browse ${label.toLowerCase()} abayas from Gulf boutiques`,
  };
}

export default async function CategoryBrowsePage({ params, searchParams }: Props) {
  const [{ category }, resolvedSearch] = await Promise.all([params, searchParams]);

  const validSlugs = (await getCategories()).map((c) => c.slug);
  if (!validSlugs.includes(category.toLowerCase())) {
    notFound();
  }

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <BrowsePage
      searchParams={Promise.resolve({ ...resolvedSearch, category: categoryLabel })}
    />
  );
}
