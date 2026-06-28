import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { archiveProduct } from "../../actions/product";

export const metadata: Metadata = { title: "Products — Luna Vendor" };

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: "bg-sand text-mist",
  ACTIVE: "bg-gold/20 text-gold",
  ARCHIVED: "bg-coral/10 text-coral",
};

type Props = { searchParams: Promise<{ status?: string }> };

export default async function ProductsPage({ searchParams }: Props) {
  const { status: statusParam } = await searchParams;

  const user = await safeCurrentUser();
  if (!user) return null;

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null;

  const validStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"];
  const statusFilter = validStatuses.includes(statusParam ?? "")
    ? (statusParam as "DRAFT" | "ACTIVE" | "ARCHIVED")
    : undefined;

  const products = await prisma.product
    .findMany({
      where: {
        vendorId: vendor.id,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: { variants: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  const tabs = [
    { label: "All", value: undefined },
    { label: "Draft", value: "DRAFT" },
    { label: "Active", value: "ACTIVE" },
    { label: "Archived", value: "ARCHIVED" },
  ] as const;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-md text-ink">Products</h2>
        <Link
          href="/products/new"
          className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink transition-colors"
        >
          + New product
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-sand">
        {tabs.map((tab) => {
          const href = tab.value ? `/products?status=${tab.value}` : "/products";
          const isActive = statusFilter === tab.value;
          return (
            <Link
              key={tab.label}
              href={href}
              className={`px-4 py-2 text-body-sm transition-colors ${
                isActive
                  ? "border-b-2 border-gold text-gold"
                  : "text-mist hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-body-md text-mist mb-3">No products yet.</p>
          <Link href="/products/new" className="text-body-sm text-gold hover:underline">
            Add your first product →
          </Link>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-sand text-left">
              <th className="pb-2 text-body-xs font-medium text-mist">Title</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Category</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Price</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Status</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Variants</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Created</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr
                key={p.id}
                className="border-b border-sand/50 hover:bg-sand/30 transition-colors"
              >
                <td className="py-3 pr-4">
                  <Link
                    href={`/products/${p.id}`}
                    className="text-body-md font-medium text-ink hover:text-gold transition-colors"
                  >
                    {p.title}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-body-sm text-mist capitalize">
                  {p.category.toLowerCase()}
                </td>
                <td className="py-3 pr-4 text-body-sm text-ink">
                  AED{" "}
                  {Number(p.price).toLocaleString("en-AE", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-body-xs font-medium ${STATUS_CLASSES[p.status]}`}
                  >
                    {STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="py-3 pr-4 text-body-sm text-mist">
                  {p.variants.length}
                </td>
                <td className="py-3 pr-4 text-body-xs text-mist">
                  {new Date(p.createdAt).toLocaleDateString("en-AE")}
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/products/${p.id}`}
                      className="text-body-xs text-gold hover:underline"
                    >
                      Edit
                    </Link>
                    {p.status !== "ARCHIVED" && (
                      <form action={archiveProduct.bind(null, p.id)}>
                        <button
                          type="submit"
                          className="text-body-xs text-mist hover:text-coral transition-colors"
                        >
                          Archive
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
