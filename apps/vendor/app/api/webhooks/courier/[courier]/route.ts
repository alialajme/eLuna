import { prisma, type ShipmentStatus } from "@e-luna/db";
import type { CourierStatusEvent } from "@e-luna/courier";
import { getCourierGateway } from "@e-luna/courier";
import { applyShipmentStatus } from "../../../../lib/courier/apply-status";

export async function POST(req: Request, { params }: { params: Promise<{ courier: string }> }) {
  const { courier } = await params;
  const gw = getCourierGateway(courier);
  if (!gw.parseWebhook) return new Response(null, { status: 200 }); // Simulated / unconfigured

  const rawBody = await req.text();
  let event: CourierStatusEvent;
  try {
    event = gw.parseWebhook(rawBody, req.headers);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (!("match" in event)) return new Response(null, { status: 200 });

  const or = [
    ...(event.match.externalRef ? [{ externalRef: event.match.externalRef }] : []),
    ...(event.match.trackingNumber ? [{ trackingNumber: event.match.trackingNumber }] : []),
  ];
  if (or.length === 0) return new Response(null, { status: 200 });

  const shipment = await prisma.shipment
    .findFirst({ where: { courier, OR: or }, select: { id: true } })
    .catch(() => null);
  if (shipment) {
    // Neutral CourierDeliveryStatus → ShipmentStatus. Only "delivered" is terminal; "in_transit" and
    // "exception" both map to IN_TRANSIT today (the TrackingTimeline renders no distinct exception state).
    const status: ShipmentStatus = event.status === "delivered" ? "DELIVERED" : "IN_TRANSIT";
    await applyShipmentStatus(shipment.id, status).catch((e) => console.error("[courier webhook] apply failed", e));
  }
  return new Response(null, { status: 200 });
}
