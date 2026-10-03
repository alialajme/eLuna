import { NextRequest, NextResponse } from "next/server";
import { getSessionForVendor } from "@ayvana/studio";
import { getCorrelationId, CORRELATION_HEADER } from "@ayvana/observability";
import { safeCurrentUser } from "../../../../../lib/auth";
import { getVendorByUserId } from "../../../../../lib/vendor";

// Poll a generation session. Ownership-checked: a non-owner gets 404 (same as a
// missing session — undisclosed existence), so Seller A can never read Seller
// B's assets. Asset URLs are signed, short-TTL.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = getCorrelationId(req);
  const headers = { [CORRELATION_HEADER]: correlationId };
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });

  const session = await getSessionForVendor(id, vendor.id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404, headers });

  return NextResponse.json({ session }, { headers });
}
