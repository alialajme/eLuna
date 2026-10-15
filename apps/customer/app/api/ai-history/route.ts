import { safeCurrentUser as currentUser } from "../../lib/auth";
import { loadAgentMessages, isAgentType } from "@ayvana/ai";
import { getAiRateLimiter, rateLimitOr429 } from "@ayvana/auth";

export async function GET(req: Request) {
  const agentType = new URL(req.url).searchParams.get("agentType") ?? "";
  if (!isAgentType(agentType)) {
    return Response.json({ error: "Invalid agentType" }, { status: 400 });
  }

  const user = await currentUser();
  if (!user) return Response.json({ messages: [] });

  // Rate-limit this authenticated DB read like the AI stream routes, so it
  // can't be polled unbounded to exhaust the connection pool.
  const limited = await rateLimitOr429(await getAiRateLimiter(), `ai-history:${user.id}`);
  if (limited) return limited;

  const messages = await loadAgentMessages(user.id, agentType);
  return Response.json({ messages });
}
