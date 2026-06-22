import { notFound } from "next/navigation";
import BrowsePage from "../page";

const VALID_CATEGORIES = ["occasion", "everyday", "travel", "sport"];

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

  if (!VALID_CATEGORIES.includes(category.toLowerCase())) {
    notFound();
  }

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <BrowsePage
      searchParams={Promise.resolve({ ...resolvedSearch, category: categoryLabel })}
    />
  );
}
