import { Metadata } from "next";
import { getAllCategories } from "@e-luna/db";
import { CategoryManager } from "./CategoryManager";

export const metadata: Metadata = { title: "Categories — Luna Ops" };

export default async function CategoriesPage() {
  const categories = await getAllCategories();

  return (
    <div className="max-w-3xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Categories</h2>
      <p className="text-body-md text-mist">The product categories shown across the storefront and vendor product forms.</p>
      <CategoryManager categories={categories} />
    </div>
  );
}
