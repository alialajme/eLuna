import { safeCurrentUser as currentUser } from "../../lib/auth";
import { prisma } from "@e-luna/db";
import { runShoppingAgent } from "@e-luna/ai";
import type { CoreMessage } from "ai";

export async function POST(req: Request) {
  try {
    const { messages, id } = (await req.json()) as {
      messages: CoreMessage[];
      id?: string;
    };

    const user = await currentUser();

    const sizeProfile = user
      ? await prisma.sizeProfile.findFirst({
          where: { customerProfile: { userId: user.id } },
        })
      : null;

    const result = await runShoppingAgent(messages, {
      sizeProfile,
      sessionId: id,
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
