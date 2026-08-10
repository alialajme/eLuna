import { prisma } from "@e-luna/db";

export type StoredMessage = { id: string; role: "user" | "assistant"; content: string };

const AGENT_TYPES = ["SHOPPING", "SELLER", "STUDIO", "LOGISTICS", "PAYMENT", "POS"] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export function isAgentType(v: string): v is AgentType {
  return (AGENT_TYPES as readonly string[]).includes(v);
}

const MAX_STORED = 50;

type LooseMessage = { id?: string; role: string; content: unknown };

function toStored(m: LooseMessage): StoredMessage | null {
  if (m.role !== "user" && m.role !== "assistant") return null;
  const content = typeof m.content === "string" ? m.content : "";
  if (!content) return null;
  return { id: m.id ?? crypto.randomUUID(), role: m.role, content };
}

export async function loadAgentMessages(userId: string, agentType: AgentType): Promise<StoredMessage[]> {
  const session = await prisma.aISession
    .findUnique({ where: { userId_agentType: { userId, agentType } }, select: { messages: true } })
    .catch(() => null);
  const raw = Array.isArray(session?.messages) ? (session!.messages as unknown[]) : [];
  return raw
    .map((m) => (m && typeof m === "object" ? toStored(m as LooseMessage) : null))
    .filter((m): m is StoredMessage => m !== null);
}

/** streamText onFinish that upserts the rolling session with the full thread (capped). */
export function persistOnFinish(userId: string, agentType: AgentType, inputMessages: LooseMessage[]) {
  return async ({ text }: { text: string }) => {
    const prior = inputMessages.map(toStored).filter((m): m is StoredMessage => m !== null);
    const full = [...prior, { id: crypto.randomUUID(), role: "assistant" as const, content: text }].slice(-MAX_STORED);
    await prisma.aISession
      .upsert({
        where: { userId_agentType: { userId, agentType } },
        create: { userId, agentType, messages: full },
        update: { messages: full },
      })
      .catch((e) => console.error("[persistOnFinish]", e));
  };
}
