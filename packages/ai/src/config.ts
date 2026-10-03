import { createAnthropic } from "@ai-sdk/anthropic";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error(
    "ANTHROPIC_API_KEY is not set. Add it to your .env file before running AYVANA agents."
  );
}

export const anthropic = createAnthropic({ apiKey });

export const AYVANA_MODEL = "claude-sonnet-4-6";

export const DEFAULT_SYSTEM_CONTEXT = `You are AYVANA, an AI assistant for AYVANA — the abaya marketplace across the GCC.
You help customers discover modest fashion, assist vendors with their boutiques, and ensure smooth platform operations.
Always respond in the language the user writes in (Arabic or English).
Be warm, culturally aware, and fashion-forward.`;
