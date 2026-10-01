import type { NextConfig } from "next";
import { securityHeadersConfig } from "@ayvana/config/security";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@ayvana/ui",
    "@ayvana/auth",
    "@ayvana/db",
    "@ayvana/ai",
    "@ayvana/einvoice",
    "@ayvana/courier",
    "@ayvana/fashion",
    "@ayvana/storage",
    "@ayvana/studio",
    "@ayvana/observability",
  ],
  async headers() {
    return securityHeadersConfig();
  },
};

export default nextConfig;
