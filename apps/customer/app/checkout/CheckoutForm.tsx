"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeOrder } from "../actions/checkout";
import { saveAddress, type AddressFormData } from "../actions/address";

type Address = {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  emirate: string | null;
  isDefault: boolean;
};

type Props = {
  addresses: Address[];
  cartTotal: number;
  cartSubtotal: number;
  shippingFee: number;
  itemCount: number;
};

const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];

const PAYMENT_METHODS = [
  { value: "CARD", label: "Credit / Debit Card", icon: "💳", desc: "Processed securely" },
  { value: "TABBY", label: "Tabby", icon: "🟢", desc: "Pay in 4 — no interest" },
  { value: "TAMARA", label: "Tamara", icon: "🟣", desc: "Split in 3 instalments" },
  { value: "LUNA_WALLET", label: "Luna Wallet", icon: "🌙", desc: "Use your Luna balance" },
  { value: "CASH_ON_DELIVERY", label: "Cash on Delivery", icon: "📦", desc: "+AED 5 fee" },
] as const;

export function CheckoutForm({ addresses, cartTotal, cartSubtotal, shippingFee, itemCount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const defaultAddr = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState<string>(defaultAddr?.id ?? "new");
  const [paymentMethod, setPaymentMethod] = useState<string>("CARD");
  const [showNewAddress, setShowNewAddress] = useState(addresses.length === 0);

  const [newAddr, setNewAddr] = useState<AddressFormData>({
    fullName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    emirate: "Dubai",
    label: "Home",
  });

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      let addressId = selectedAddressId;

      if (showNewAddress || selectedAddressId === "new") {
        const saveResult = await saveAddress(newAddr);
        if (!saveResult.success) {
          setError(saveResult.error ?? "Could not save address");
          return;
        }
        // Refresh to pick up the new address, user clicks Place Order again
        router.refresh();
        return;
      }

      const result = await placeOrder({
        addressId,
        paymentMethod: paymentMethod as "CARD" | "LUNA_WALLET" | "TABBY" | "TAMARA" | "CASH_ON_DELIVERY",
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push(`/checkout/confirm?orderId=${result.orderId}`);
    });
  }

  return (
    <form onSubmit={handlePlaceOrder} className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:grid lg:grid-cols-3 lg:gap-8">
      <div className="lg:col-span-2 space-y-8">
        {/* Delivery Address */}
        <section>
          <h2 className="font-display text-display-sm text-ink mb-4">Delivery Address</h2>
          {addresses.length > 0 && (
            <div className="space-y-3 mb-4">
              {addresses.map((addr) => (
                <label
                  key={addr.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${
                    selectedAddressId === addr.id && !showNewAddress
                      ? "border-ink bg-ink/5"
                      : "border-sand hover:border-ink/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="addressId"
                    value={addr.id}
                    checked={selectedAddressId === addr.id && !showNewAddress}
                    onChange={() => { setSelectedAddressId(addr.id); setShowNewAddress(false); }}
                    className="mt-1 accent-ink"
                  />
                  <div className="text-body-md text-ink">
                    <p className="font-medium">
                      {addr.fullName}{" "}
                      {addr.label && <span className="text-mist text-body-sm">({addr.label})</span>}
                    </p>
                    <p className="text-mist">{addr.phone}</p>
                    <p>{addr.addressLine1}{addr.addressLine2 ? `, ${addr.addressLine2}` : ""}</p>
                    <p>{addr.city}{addr.emirate ? `, ${addr.emirate}` : ""}, UAE</p>
                    {addr.isDefault && <span className="text-gold text-body-sm">✦ Default</span>}
                  </div>
                </label>
              ))}
              <button
                type="button"
                onClick={() => setShowNewAddress(true)}
                className="text-body-sm text-mist hover:text-gold transition-colors"
              >
                + Add new address
              </button>
            </div>
          )}

          {(showNewAddress || addresses.length === 0) && (
            <div className="rounded-xl border border-sand p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-label text-mist block mb-1">LABEL</label>
                  <select
                    value={newAddr.label ?? "Home"}
                    onChange={(e) => setNewAddr((p) => ({ ...p, label: e.target.value }))}
                    className="w-full rounded-lg border border-sand px-3 py-2 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
                  >
                    <option>Home</option>
                    <option>Work</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-label text-mist block mb-1">EMIRATE</label>
                  <select
                    value={newAddr.emirate ?? "Dubai"}
                    onChange={(e) => setNewAddr((p) => ({ ...p, emirate: e.target.value }))}
                    className="w-full rounded-lg border border-sand px-3 py-2 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
                  >
                    {EMIRATES.map((e) => <option key={e}>{e}</option>)}
                  </select>
                </div>
              </div>
              {[
                { key: "fullName", label: "FULL NAME", placeholder: "Fatima Al Hashemi" },
                { key: "phone", label: "PHONE", placeholder: "+971 50 123 4567" },
                { key: "addressLine1", label: "ADDRESS LINE 1", placeholder: "Villa 12, Street 5" },
                { key: "addressLine2", label: "ADDRESS LINE 2 (OPTIONAL)", placeholder: "Al Barsha 1" },
                { key: "city", label: "CITY", placeholder: "Dubai" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-label text-mist block mb-1">{label}</label>
                  <input
                    type="text"
                    placeholder={placeholder}
                    value={(newAddr as Record<string, string>)[key] ?? ""}
                    onChange={(e) => setNewAddr((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full rounded-lg border border-sand px-3 py-2 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Payment Method */}
        <section>
          <h2 className="font-display text-display-sm text-ink mb-4">Payment Method</h2>
          <div className="space-y-3">
            {PAYMENT_METHODS.map((method) => (
              <label
                key={method.value}
                className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-colors ${
                  paymentMethod === method.value ? "border-ink bg-ink/5" : "border-sand hover:border-ink/30"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method.value}
                  checked={paymentMethod === method.value}
                  onChange={() => setPaymentMethod(method.value)}
                  className="accent-ink"
                />
                <span className="text-xl">{method.icon}</span>
                <div>
                  <p className="text-body-md font-medium text-ink">{method.label}</p>
                  <p className="text-body-sm text-mist">{method.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-md text-coral">
            {error}
          </div>
        )}
      </div>

      {/* Order Summary */}
      <div className="mt-8 lg:mt-0">
        <div className="rounded-2xl border border-sand bg-ivory p-6 sticky top-24">
          <h2 className="font-display text-display-sm text-ink mb-4">Order Summary</h2>
          <div className="space-y-3 text-body-md">
            <div className="flex justify-between text-mist">
              <span>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
              <span>AED {cartSubtotal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-mist">
              <span>Shipping</span>
              <span>
                {shippingFee === 0
                  ? <span className="text-sage">Free</span>
                  : `AED ${shippingFee.toFixed(2)}`}
              </span>
            </div>
            <div className="border-t border-sand pt-3 flex justify-between font-display text-body-lg font-semibold text-ink">
              <span>Total</span>
              <span>AED {cartTotal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="mt-6 flex w-full items-center justify-center rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-60"
          >
            {isPending ? "Processing…" : "Place Order"}
          </button>

          <p className="mt-3 text-center text-body-xs text-mist">
            By placing your order, you agree to Luna&apos;s Terms &amp; Conditions
          </p>
        </div>
      </div>
    </form>
  );
}
