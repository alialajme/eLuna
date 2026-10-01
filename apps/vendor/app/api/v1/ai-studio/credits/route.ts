import { NextRequest, NextResponse } from "next/server";
import { ensureWallet, getSubscription } from "@ayvana/db";
import { getCorrelationId, CORRELATION_HEADER } from "@ayvana/observability";
import { safeCurrentUser } from "../../../../lib/auth";
import { getVendorByUserId } from "../../../../lib/vendor";

// Wallet balance + subscription summary for the signed-in vendor. vendorId is
// resolved server-side (never a client param) so a vendor can only read their
// own wallet. Used by the product-flow launcher to show "N shoots left".
export async function GET(req: NextRequest) {
  const correlationId = getCorrelationId(req);
  const headers = { [CORRELATION_HEADER]: correlationId };

  const user = await safeCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });

  const [wallet, subscription] = await Promise.all([ensureWallet(vendor.id), getSubscription(vendor.id)]);

  return NextResponse.json(
    {
      available: Number(wallet.available),
      reserved: Number(wallet.reserved),
      plan: subscription ? { code: subscription.planCode, name: subscription.planName, expired: subscription.expired } : null,
    },
    { headers },
  );
}
