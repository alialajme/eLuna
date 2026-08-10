export type Courier = { id: string; name: string; trackingUrl: (tn: string) => string };

export const COURIERS: Courier[] = [
  { id: "aramex",        name: "Aramex",        trackingUrl: (t) => `https://www.aramex.com/us/en/track/results?ShipmentNumber=${encodeURIComponent(t)}` },
  { id: "fetchr",        name: "Fetchr",        trackingUrl: (t) => `https://www.fetchr.us/track/${encodeURIComponent(t)}` },
  { id: "quiqup",        name: "Quiqup",        trackingUrl: (t) => `https://www.quiqup.com/track?tracking=${encodeURIComponent(t)}` },
  { id: "emirates_post", name: "Emirates Post", trackingUrl: (t) => `https://www.epg.gov.ae/en/track?trackingNumber=${encodeURIComponent(t)}` },
  { id: "dhl",           name: "DHL",           trackingUrl: (t) => `https://www.dhl.com/ae-en/home/tracking.html?tracking-id=${encodeURIComponent(t)}` },
];

export function getCourier(id: string): Courier | undefined {
  return COURIERS.find((c) => c.id === id);
}

export function courierName(id: string): string {
  return getCourier(id)?.name ?? id;
}

export function trackingUrl(id: string, tn: string): string | null {
  const c = getCourier(id);
  return c ? c.trackingUrl(tn) : null;
}
