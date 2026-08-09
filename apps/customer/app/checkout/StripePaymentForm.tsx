"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function PayInner({ orderId }: { orderId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/confirm?orderId=${orderId}`,
      },
    });
    // If we reach here, confirmation failed before redirect.
    if (confirmError) {
      setError(confirmError.message ?? "Payment could not be completed.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <PaymentElement />
      {error && (
        <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-md text-coral">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="flex w-full items-center justify-center rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-60"
      >
        {submitting ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}

export function StripePaymentForm({ clientSecret, orderId }: { clientSecret: string; orderId: string }) {
  if (!stripePromise) {
    return (
      <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-md text-coral">
        Card payments are not configured. Please choose another method.
      </div>
    );
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "flat" } }}>
      <PayInner orderId={orderId} />
    </Elements>
  );
}
