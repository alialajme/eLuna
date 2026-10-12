import { streamText, generateText, tool, type CoreMessage } from "ai";
import { z } from "zod";
import { prisma } from "@ayvana/db";
import { anthropic, AYVANA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const CASE_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}
You are the AYVANA Case Manager assistant for support/admin staff. Help triage
and resolve customer, vendor, and supplier cases. Ground every suggestion in the
case history retrieved via tools — never invent order numbers, policies, or facts.
You cannot change case state or send messages; you only advise and draft.`;

/** All tools are READ-ONLY. handlerUserId is captured here, never an LLM arg. */
export function buildCaseTools(_handlerUserId: string) {
  return {
    list_open_cases: tool({
      description: "List cases that still need work (not RESOLVED/CLOSED/CANCELLED).",
      parameters: z.object({ limit: z.number().default(20) }),
      execute: async ({ limit }) => {
        const cases = await prisma.case
          .findMany({ where: { status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER"] } }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: limit, select: { id: true, caseNumber: true, subject: true, priority: true, status: true } })
          .catch(() => []);
        return { cases };
      },
    }),
    case_context: tool({
      description: "Full history of one case: fields + non-internal messages.",
      parameters: z.object({ caseId: z.string() }),
      execute: async ({ caseId }) => {
        const c = await prisma.case.findUnique({ where: { id: caseId }, include: { category: { select: { name: true } }, messages: { orderBy: { createdAt: "asc" }, select: { authorRole: true, body: true, isInternal: true, createdAt: true } } } }).catch(() => null);
        if (!c) return { error: "not found" };
        return { case: { ...c, messages: c.messages.filter((m) => !m.isInternal) } };
      },
    }),
    draft_reply: tool({
      description: "Draft a customer-facing reply for the handler to review (does NOT send).",
      parameters: z.object({ caseId: z.string(), tone: z.enum(["apologetic", "neutral", "reassuring"]).default("neutral") }),
      execute: async ({ caseId }) => {
        const c = await prisma.case.findUnique({ where: { id: caseId }, select: { subject: true, description: true } }).catch(() => null);
        return c ? { ok: true, context: c } : { ok: false };
      },
    }),
  };
}

export async function runCaseAgent(messages: CoreMessage[], opts: { handlerUserId: string; onFinish?: (text: string) => void }) {
  return streamText({
    model: anthropic(AYVANA_MODEL),
    system: CASE_SYSTEM,
    messages,
    tools: buildCaseTools(opts.handlerUserId),
    toolChoice: "auto",
    maxSteps: 5,
    onFinish: (r) => opts.onFinish?.(r.text),
  });
}

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TriageSuggestion = { categorySlug: string; priority: (typeof PRIORITIES)[number] } | null;

/**
 * One-shot classification used by the worker on case.created. Returns null if
 * the model is unavailable (keyless/no key) or the output can't be parsed — the
 * caller simply skips triage.
 */
export async function classifyCase(input: { subject: string; description: string; categorySlugs: string[] }): Promise<TriageSuggestion> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await generateText({
      model: anthropic(AYVANA_MODEL),
      prompt: `Classify this support case. Reply with ONLY compact JSON {"categorySlug":"<one of: ${input.categorySlugs.join(", ")}>","priority":"<one of LOW|MEDIUM|HIGH|URGENT>"}.\nSubject: ${input.subject}\nBody: ${input.description}`,
    });
    const m = res.text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as { categorySlug?: string; priority?: string };
    if (!parsed.categorySlug || !input.categorySlugs.includes(parsed.categorySlug)) return null;
    const priority = (PRIORITIES as readonly string[]).includes(parsed.priority ?? "") ? (parsed.priority as (typeof PRIORITIES)[number]) : "MEDIUM";
    return { categorySlug: parsed.categorySlug, priority };
  } catch {
    return null;
  }
}
