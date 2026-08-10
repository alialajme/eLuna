import { safeCurrentUser as currentUser } from "../../lib/auth";
import { loadAgentMessages, isAgentType } from "@e-luna/ai";

export async function GET(req: Request) {
  const agentType = new URL(req.url).searchParams.get("agentType") ?? "";
  if (!isAgentType(agentType)) return Response.json({ messages: [] });

  const user = await currentUser();
  if (!user) return Response.json({ messages: [] });

  const messages = await loadAgentMessages(user.id, agentType);
  return Response.json({ messages });
}
