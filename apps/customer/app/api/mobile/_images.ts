// Curated, verified fashion imagery for the AYVANA app. The seed catalog used
// loremflickr URLs, which now return 401, so the mobile API maps those to a
// stable pool of Unsplash photos chosen deterministically per product.
const POOL = [
  "photo-1595777457583-95e059d581b8",
  "photo-1594633312681-425c7b97ccd1",
  "photo-1490481651871-ab68de25d43d",
  "photo-1483985988355-763728e1935b",
  "photo-1539109136881-3be0616acf4b",
  "photo-1515886657613-9f3515b0c78f",
  "photo-1487222477894-8943e31ef7b2",
  "photo-1529139574466-a303027c1d8b",
  "photo-1496747611176-843222e1e57c",
  "photo-1524504388940-b1c1722653e1",
  "photo-1485968579580-b6d095142e6e",
  "photo-1502716119720-b23a93e5fe1b",
  "photo-1469334031218-e382a71b716b",
];

const url = (id: string) => `https://images.unsplash.com/${id}?w=900&q=80&auto=format&fit=crop`;

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

const broken = (u: string | null | undefined) => !u || u.includes("loremflickr");

/** One image for a product, keeping any already-valid stored URL. */
export function coverImage(seed: string, stored?: string | null): string {
  if (!broken(stored)) return stored as string;
  return url(POOL[hash(seed) % POOL.length]!);
}

/** A small gallery of distinct images for a product detail screen. */
export function galleryImages(seed: string, stored: string[], count = 3): string[] {
  const valid = stored.filter((u) => !broken(u));
  if (valid.length >= count) return valid.slice(0, count);
  const start = hash(seed) % POOL.length;
  const picks: string[] = [];
  for (let i = 0; i < count; i++) picks.push(url(POOL[(start + i) % POOL.length]!));
  return [...valid, ...picks].slice(0, count);
}
