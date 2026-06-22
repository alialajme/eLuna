"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { removeFromCart, updateCartQty } from "../actions/cart";

type CartLineItem = {
  variantId: string;
  qty: number;
  productId: string;
  slug: string;
  title: string;
  vendorName: string;
  size: string;
  color: string;
  unitPrice: number;
  imageUrl: string | null;
};

type Props = {
  items: CartLineItem[];
};

const SHIPPING_THRESHOLD = 500;
const SHIPPING_FEE = 15;

export function CartReview({ items: initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();

  function handleQtyChange(variantId: string, newQty: number) {
    if (newQty < 1) return;
    setItems((prev) =>
      prev.map((item) =>
        item.variantId === variantId ? { ...item, qty: newQty } : item
      )
    );
    startTransition(async () => {
      await updateCartQty(variantId, newQty);
    });
  }

  function handleRemove(variantId: string) {
    setItems((prev) => prev.filter((item) => item.variantId !== variantId));
    startTransition(async () => {
      await removeFromCart(variantId);
    });
  }

  if (items.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="font-display text-display-md text-ink mb-2">Your bag is empty</p>
        <p className="text-body-md text-mist mb-6">Find something you love</p>
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors"
        >
          Browse abayas
        </Link>
      </div>
    );
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const shippingFee = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal + shippingFee;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:grid lg:grid-cols-3 lg:gap-8">
      <div className="lg:col-span-2">
        <h1 className="font-display text-display-md text-ink mb-6">Your Bag</h1>
        <ul className="divide-y divide-sand">
          {items.map((item) => (
            <li key={item.variantId} className="flex gap-4 py-6">
              <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-sand/40">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-mist text-body-xs">No image</div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <Link href={`/p/${item.slug}`} className="text-body-md font-medium text-ink hover:text-gold transition-colors">
                  {item.title}
                </Link>
                <p className="text-body-sm text-mist">{item.vendorName}</p>
                <p className="text-body-sm text-mist">
                  {item.size} · {item.color}
                </p>
                <p className="font-display text-body-lg text-gold">
                  AED {(item.unitPrice * item.qty).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                </p>
                <div className="mt-2 flex items-center gap-4">
                  <div className="flex items-center rounded-full border border-sand">
                    <button
                      type="button"
                      onClick={() => handleQtyChange(item.variantId, item.qty - 1)}
                      disabled={isPending || item.qty <= 1}
                      className="px-3 py-1 text-body-md text-ink disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="px-2 text-body-md text-ink">{item.qty}</span>
                    <button
                      type="button"
                      onClick={() => handleQtyChange(item.variantId, item.qty + 1)}
                      disabled={isPending || item.qty >= 99}
                      className="px-3 py-1 text-body-md text-ink disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.variantId)}
                    disabled={isPending}
                    className="text-body-sm text-mist hover:text-coral transition-colors disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 lg:mt-0">
        <div className="rounded-2xl border border-sand bg-ivory p-6 sticky top-24">
          <h2 className="font-display text-display-sm text-ink mb-4">Summary</h2>
          <div className="space-y-3 text-body-md">
            <div className="flex justify-between text-mist">
              <span>Subtotal</span>
              <span>AED {subtotal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-mist">
              <span>Shipping</span>
              <span>{shippingFee === 0 ? <span className="text-sage">Free</span> : `AED ${shippingFee.toFixed(2)}`}</span>
            </div>
            {shippingFee > 0 && (
              <p className="text-body-sm text-mist">
                Add AED {(SHIPPING_THRESHOLD - subtotal).toLocaleString("en-AE", { minimumFractionDigits: 2 })} more for free shipping
              </p>
            )}
            <div className="border-t border-sand pt-3 flex justify-between font-display text-body-lg font-semibold text-ink">
              <span>Total</span>
              <span>AED {total.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-sand/50 px-4 py-3 text-body-sm text-mist">
            🟢 Split into 4 payments with <strong className="text-ink">Tabby</strong> — available at checkout
          </div>

          <Link
            href="/checkout"
            className="mt-4 flex w-full items-center justify-center rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors"
          >
            Proceed to Checkout
          </Link>

          <Link
            href="/browse"
            className="mt-3 flex w-full items-center justify-center text-body-sm text-mist hover:text-gold transition-colors"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
