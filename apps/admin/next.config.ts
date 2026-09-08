import type { NextConfig } from "next";
import { securityHeadersConfig } from "@e-luna/config/security";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@e-luna/ui", "@e-luna/auth", "@e-luna/db", "@e-luna/ai"],
  async headers() {
    return securityHeadersConfig();
  },
};

export default nextConfig;
