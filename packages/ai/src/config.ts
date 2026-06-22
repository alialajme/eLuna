import { createAnthropic } from "@ai-sdk/anthropic";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error(
    "ANTHROPIC_API_KEY is not set. Add it to your .env file before running Luna agents."
  );
}

export const anthropic = createAnthropic({ apiKey });

export const LUNA_MODEL = "claude-sonnet-4-6";

export const DEFAULT_SYSTEM_CONTEXT = `You are Luna, an AI assistant for e-Luna — the Gulf's AI-powered abaya marketplace.
You help customers discover modest fashion, assist vendors with their boutiques, and ensure smooth platform operations.
Always respond in the language the user writes in (Arabic or English).
Be warm, culturally aware, and fashion-forward.`;
