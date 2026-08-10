import type { Config } from "tailwindcss";
import { lunaPreset } from "@e-luna/config/tailwind";

const config: Config = {
  presets: [lunaPreset as Config],
  content: [
    "./app/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
