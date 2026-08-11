import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";
import { runSupplierAgent, persistOnFinish } from "@e-luna/ai";
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

    const supplier = await getSupplierByUserId(user.id);
    if (!supplier) {
      return new Response(JSON.stringify({ error: "Supplier not found" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    // API routes bypass the (dashboard) layout gate, so re-check status here.
    if (supplier.status !== "ACTIVE") {
      return new Response(JSON.stringify({ error: "Account not active" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await runSupplierAgent(messages, {
      supplierId: supplier.id,
      onFinish: persistOnFinish(user.id, "SUPPLIER", messages),
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
