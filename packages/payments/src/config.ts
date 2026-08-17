export const hasStripe = () => !!process.env.STRIPE_SECRET_KEY;
export const hasTap = () => !!process.env.TAP_SECRET_KEY;
export const hasNoqodi = () => !!process.env.NOQODI_API_KEY;
export const hasNeopay = () => !!process.env.NEOPAY_API_KEY;
export const neopayAvailable = () => hasNeopay() || process.env.NODE_ENV !== "production";

export function stripeConfig() {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not set");
  return { secret, webhookSecret };
}
