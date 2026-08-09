"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { syncOrderPayment } from "../actions/checkout";

// Client-invoked so the server action may mutate cookies (clear the cart) legally.
export function ConfirmPaymentSync({ orderId }: { orderId: string }) {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    syncOrderPayment(orderId).then((r) => {
      if (r.status !== "PENDING") router.refresh();
    });
  }, [orderId, router]);
  return null;
}
