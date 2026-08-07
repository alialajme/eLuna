import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@e-luna/ui", "@e-luna/auth", "@e-luna/db", "@e-luna/ai"],
};

export default nextConfig;
