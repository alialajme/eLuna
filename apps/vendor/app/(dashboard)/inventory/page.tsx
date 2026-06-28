import { Metadata } from "next";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { StockInput } from "./components/StockInput";

export const metadata: Metadata = { title: "Inventory — Luna Vendor" };

export default async function InventoryPage() {
  const user = await safeCurrentUser();
  if (!user) return null;

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null;

  const variants = await prisma.productVariant
    .findMany({
      where: { product: { vendorId: vendor.id } },
      include: { product: { select: { title: true } } },
      orderBy: [
        { product: { title: "asc" } },
        { size: "asc" },
        { color: "asc" },
      ],
    })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Inventory</h2>

      {variants.length === 0 ? (
        <p className="text-body-md text-mist py-10">No inventory yet.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-sand text-left">
              <th className="pb-2 text-body-xs font-medium text-mist">Product</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Size</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Color</th>
              <th className="pb-2 text-body-xs font-medium text-mist">SKU</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Stock</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const isLow = v.stock <= 3;
              const isOut = v.stock === 0;
              return (
                <tr
                  key={v.id}
                  className={`border-b border-sand/50 ${isLow ? "bg-coral/5" : ""}`}
                >
                  <td className="py-3 pr-4 text-body-sm text-ink">
                    {v.product.title}
                  </td>
                  <td className="py-3 pr-4 text-body-sm text-mist">{v.size}</td>
                  <td className="py-3 pr-4 text-body-sm text-mist">{v.color}</td>
                  <td className="py-3 pr-4 text-body-xs text-mist font-mono">
                    {v.sku}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <StockInput
                        variantId={v.id}
                        initialStock={v.stock}
                      />
                      {isOut && (
                        <span className="text-body-xs text-coral font-medium">
                          (Out of stock)
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
