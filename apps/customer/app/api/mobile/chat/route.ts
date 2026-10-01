import { runShoppingAgent } from "@ayvana/ai";
import type { CoreMessage } from "ai";

export const dynamic = "force-dynamic";

// Non-streaming chat for the native app: runs the guest-tolerant Shopping agent
// and returns the final reply text (simpler to consume in React Native than SSE).
export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: CoreMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "No messages" }, { status: 400 });
    }
    const result = await runShoppingAgent(messages, { sizeProfile: null });
    const reply = await result.text;
    return Response.json({ reply: reply || "I'm here — tell me the occasion and I'll find your abaya." });
  } catch (error) {
    console.error("[/api/mobile/chat]", error);
    return Response.json(
      { reply: "Sorry, I couldn't respond just now. Please try again." },
      { status: 200 },
    );
  }
}
