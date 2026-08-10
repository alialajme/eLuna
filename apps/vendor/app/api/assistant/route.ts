import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { runSellerAgent, persistOnFinish } from "@e-luna/ai";
import type { CoreMessage } from "ai";

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: CoreMessage[] };

    const user = await safeCurrentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const vendor = await getVendorByUserId(user.id);
    if (!vendor) {
      return new Response(JSON.stringify({ error: "Vendor not found" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await runSellerAgent(messages, {
      vendorId: vendor.id,
      onFinish: persistOnFinish(user.id, "SELLER", messages),
    });
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[/api/assistant] error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
