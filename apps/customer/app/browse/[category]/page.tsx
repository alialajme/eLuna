import { notFound } from "next/navigation";
import BrowsePage from "../page";

const VALID_CATEGORIES = ["occasion", "everyday", "travel", "sport"];

type Props = {
  params: { category: string };
  searchParams: Record<string, string | string[] | undefined>;
};

export async function generateMetadata({ params }: Props) {
  const label = params.category.charAt(0).toUpperCase() + params.category.slice(1);
  return {
    title: `${label} Abayas — Luna`,
    description: `Browse ${label.toLowerCase()} abayas from Gulf boutiques`,
  };
}

export default function CategoryBrowsePage({ params, searchParams }: Props) {
  if (!VALID_CATEGORIES.includes(params.category.toLowerCase())) {
    notFound();
  }

  const categoryLabel = params.category.charAt(0).toUpperCase() + params.category.slice(1);

  return (
    <BrowsePage
      searchParams={{ ...searchParams, category: categoryLabel }}
    />
  );
}
