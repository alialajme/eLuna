import { streamText, tool } from "ai";
import { z } from "zod";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const STUDIO_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Studio Agent. Given 3 garment photos, you generate professional product descriptions,
AI-enhanced images, and short video concepts for marketing campaigns.
Focus on Gulf fashion aesthetics — luxury, modesty, elegance.`;

export const studioTools = {
  detect_garment: tool({
    description: "Analyze uploaded photos to detect garment type, color, fabric, and style",
    parameters: z.object({
      imageUrls: z.array(z.string()).max(3),
    }),
    execute: async ({ imageUrls }) => {
      return { garmentType: "", color: "", fabric: "", style: "", details: [] };
    },
  }),

  generate_images: tool({
    description: "Generate professional product images from uploaded garment photos",
    parameters: z.object({
      studioUploadId: z.string(),
      style: z.enum(["editorial", "product", "lifestyle"]).default("product"),
      count: z.number().min(1).max(8).default(4),
    }),
    execute: async ({ studioUploadId, style, count }) => {
      return { imageUrls: [], jobId: "" };
    },
  }),

  write_copy: tool({
    description: "Write product title, description, and marketing copy in English and Arabic",
    parameters: z.object({
      garmentDetails: z.object({
        type: z.string(),
        color: z.string(),
        fabric: z.string(),
        style: z.string(),
      }),
      tone: z.enum(["luxury", "casual", "formal"]).default("luxury"),
    }),
    execute: async ({ garmentDetails, tone }) => {
      return { titleEn: "", titleAr: "", descriptionEn: "", descriptionAr: "", tags: [] };
    },
  }),

  generate_video: tool({
    description: "Generate a short product showcase video concept",
    parameters: z.object({
      studioUploadId: z.string(),
      durationSeconds: z.number().min(5).max(30).default(15),
    }),
    execute: async ({ studioUploadId, durationSeconds }) => {
      return { videoUrl: null, thumbnailUrl: null, jobId: "" };
    },
  }),
};

export async function runStudioAgent(
  messages: { role: "user" | "assistant"; content: string }[],
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: STUDIO_SYSTEM,
    messages,
    tools: studioTools,
    maxSteps: 8,
  });
}
