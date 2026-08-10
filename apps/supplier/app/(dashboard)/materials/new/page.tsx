import { Metadata } from "next";
import { MaterialForm } from "../../components/MaterialForm";

export const metadata: Metadata = { title: "New material — Luna Supplier" };

export default function NewMaterialPage() {
  return (
    <div className="max-w-3xl">
      <h2 className="font-display text-display-md text-ink mb-6">New material</h2>
      <MaterialForm />
    </div>
  );
}
