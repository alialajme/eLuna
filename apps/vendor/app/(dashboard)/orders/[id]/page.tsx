import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";
import { FulfillmentPanel } from "../components/FulfillmentPanel";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order #${id.slice(-8).toUpperCase()} — Luna Vendor` };
}

const PAYMENT_LABELS: Record<string, string> = {
  CARD: "Card",
  LUNA_WALLET: "Luna Wallet",
  TABBY: "Tabby",
  TAMARA: "Tamara",
};

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const items = await prisma.orderItem
    .findMany({
      where: { orderId: id, vendorId: vendor.id },
      include: {
        order: { include: { address: true } },
        variant: { include: { product: { select: { title: true } } } },
      },
    })
    .catch(() => []);

  if (items.length === 0) redirect("/orders");

  const order = items[0]!.order;
  const address = order.address;
  const subtotal = items.reduce(
    (sum, i) => sum + Number(i.unitPrice) * i.quantity,
    0
  );

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">
        Order #{id.slice(-8).toUpperCase()}
      </h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
        {/* Left: items table + fulfillment panel */}
        <div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-sand text-left">
                <th className="pb-2 text-body-xs font-medium text-mist">Product</th>
                <th className="pb-2 text-body-xs font-medium text-mist">Variant</th>
                <th className="pb-2 text-body-xs font-medium text-mist">Qty</th>
                <th className="pb-2 text-body-xs font-medium text-mist">Unit price</th>
                <th className="pb-2 text-body-xs font-medium text-mist">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-sand/50">
                  <td className="py-3 pr-3 text-body-sm text-ink">
                    {item.variant.product.title}
                  </td>
                  <td className="py-3 pr-3 text-body-sm text-mist">
                    {item.variant.size} / {item.variant.color}
                  </td>
                  <td className="py-3 pr-3 text-body-sm text-ink">
                    {item.quantity}
                  </td>
                  <td className="py-3 pr-3 text-body-sm text-ink">
                    AED {Number(item.unitPrice).toLocaleString("en-AE")}
                  </td>
                  <td className="py-3 text-body-sm text-ink">
                    AED{" "}
                    {(Number(item.unitPrice) * item.quantity).toLocaleString(
                      "en-AE"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <FulfillmentPanel
            items={items.map((i) => ({
              id: i.id,
              fulfillmentStatus: i.fulfillmentStatus,
            }))}
          />
        </div>

        {/* Right: order info sidebar */}
        <div className="rounded-lg border border-sand bg-ivory p-4 space-y-4 h-fit">
          <div>
            <p className="text-body-xs text-mist mb-0.5">Order</p>
            <p className="font-mono text-body-sm text-ink">
              {id.slice(-8).toUpperCase()}
            </p>
          </div>
          <div>
            <p className="text-body-xs text-mist mb-0.5">Placed</p>
            <p className="text-body-sm text-ink">
              {new Date(order.createdAt).toLocaleDateString("en-AE", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="text-body-xs text-mist mb-0.5">Payment</p>
            <p className="text-body-sm text-ink">
              {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
            </p>
          </div>
          <div className="border-t border-sand pt-4">
            <p className="text-body-xs text-mist mb-1">Ship to</p>
            <p className="text-body-sm text-ink leading-relaxed">
              {address.fullName}
              <br />
              {address.addressLine1}
              <br />
              {address.city}
              {address.emirate ? `, ${address.emirate}` : ""}
              <br />
              UAE
            </p>
          </div>
          <div className="border-t border-sand pt-4">
            <p className="text-body-xs text-mist mb-0.5">Your subtotal</p>
            <p className="text-body-md font-medium text-ink">
              AED{" "}
              {subtotal.toLocaleString("en-AE", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
