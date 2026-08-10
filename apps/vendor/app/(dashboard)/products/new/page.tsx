import { Metadata } from "next";
import { getCategories } from "@e-luna/db";
import { ProductForm } from "../components/ProductForm";

export const metadata: Metadata = { title: "New product — Luna Vendor" };

export default async function NewProductPage() {
  return (
    <div className="max-w-4xl">
      <h2 className="font-display text-display-md text-ink mb-6">New product</h2>
      <ProductForm categories={await getCategories()} />
    </div>
  );
}
