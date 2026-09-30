import { safeCurrentUser as currentUser } from "../../lib/auth";
import { prisma } from "@ayvana/db";
import { runLogisticsAgent, persistOnFinish } from "@ayvana/ai";
import { getAiRateLimiter, rateLimitOr429 } from "@ayvana/auth";
import type { CoreMessage } from "ai";

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: CoreMessage[] };

    const user = await currentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const limited = await rateLimitOr429(await getAiRateLimiter(), `delivery-help:${user.id}`);
    if (limited) return limited;

    const profile = await prisma.customerProfile
      .findUnique({ where: { userId: user.id }, select: { id: true } })
      .catch(() => null);
    if (!profile) {
      return new Response(JSON.stringify({ error: "Customer profile not found" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await runLogisticsAgent(messages, {
      customerId: profile.id,
      onFinish: persistOnFinish(user.id, "LOGISTICS", messages),
    });
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[/api/delivery-help] error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
