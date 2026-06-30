import { streamText, tool, generateText } from "ai";
import { z } from "zod";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

// ─── Standalone AI helpers (used by server actions) ──────────────────────────

export async function detectGarment(imageUrls: string[]): Promise<{
  garmentType: string;
  color: string;
  fabric: string;
  style: string;
  details: string[];
}> {
  const { text } = await generateText({
    model: anthropic(LUNA_MODEL),
    messages: [
      {
        role: "user",
        content: [
          ...imageUrls.map((url) => ({
            type: "image" as const,
            image: url,
          })),
          {
            type: "text" as const,
            text: `Analyze these abaya photos. Return JSON only (no markdown, no explanation):
{
  "garmentType": "e.g. Overhead Abaya",
  "color": "e.g. Midnight Black",
  "fabric": "e.g. Silk blend",
  "style": "e.g. Floral embroidery",
  "details": ["detail1", "detail2", "detail3"]
}`,
          },
        ],
      },
    ],
  });

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse garment detection response: ${text}`);
  }
}

export async function writeCopy(garment: {
  garmentType: string;
  color: string;
  fabric: string;
  style: string;
  details: string[];
}): Promise<{
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  tags: string[];
}> {
  const { text } = await generateText({
    model: anthropic(LUNA_MODEL),
    prompt: `You are a luxury Gulf fashion copywriter for e-Luna, the Gulf's premier abaya marketplace.
Write product copy for this garment:
${JSON.stringify(garment, null, 2)}

Return JSON only (no markdown, no explanation):
{
  "titleEn": "product title in English, max 60 characters",
  "titleAr": "عنوان المنتج بالعربية، بحد أقصى 60 حرف",
  "descriptionEn": "2-3 sentence luxury marketing description in English",
  "descriptionAr": "وصف تسويقي فاخر من 2-3 جمل باللغة العربية",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`,
  });

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse copy generation response: ${text}`);
  }
}

// ─── Studio agent (streaming, used by future chat interface) ─────────────────

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
      return detectGarment(imageUrls);
    },
  }),

  generate_images: tool({
    description: "Generate professional product images from uploaded garment photos",
    parameters: z.object({
      studioUploadId: z.string(),
      style: z.enum(["editorial", "product", "lifestyle"]).default("product"),
      count: z.number().min(1).max(8).default(4),
    }),
    execute: async () => {
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
    execute: async ({ garmentDetails }) => {
      return writeCopy({
        garmentType: garmentDetails.type,
        color: garmentDetails.color,
        fabric: garmentDetails.fabric,
        style: garmentDetails.style,
        details: [],
      });
    },
  }),

  generate_video: tool({
    description: "Generate a short product showcase video concept",
    parameters: z.object({
      studioUploadId: z.string(),
      durationSeconds: z.number().min(5).max(30).default(15),
    }),
    execute: async () => {
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
