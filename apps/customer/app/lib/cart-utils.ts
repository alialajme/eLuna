export type CartItem = {
  variantId: string;
  qty: number;
  addedAt: string;
};

export function parseCart(raw: string | undefined): CartItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CartItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as CartItem).variantId === "string" &&
        typeof (item as CartItem).qty === "number"
    );
  } catch {
    return [];
  }
}
