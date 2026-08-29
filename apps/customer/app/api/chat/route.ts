import { safeCurrentUser as currentUser } from "../../lib/auth";
import { prisma } from "@e-luna/db";
import { runShoppingAgent, persistOnFinish } from "@e-luna/ai";
import { createInMemoryRateLimiter, rateLimitOr429 } from "@e-luna/auth";
import type { CoreMessage } from "ai";

// Guest-tolerant endpoint: limit by user when signed in, else by client IP.
const limiter = createInMemoryRateLimiter({ windowMs: 60_000, max: 30 });

export async function POST(req: Request) {
  try {
    const { messages, id } = (await req.json()) as {
      messages: CoreMessage[];
      id?: string;
    };

    const user = await currentUser();

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limited = await rateLimitOr429(limiter, `chat:${user?.id ?? ip}`);
    if (limited) return limited;

    const sizeProfile = user
      ? await prisma.sizeProfile.findFirst({
          where: { customerProfile: { userId: user.id } },
        }).catch(() => null)
      : null;

    const result = await runShoppingAgent(messages, {
      sizeProfile,
      sessionId: id,
      onFinish: user ? persistOnFinish(user.id, "SHOPPING", messages) : undefined,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[/api/chat] Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
