import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@e-luna/ui", "@e-luna/auth", "@e-luna/db", "@e-luna/ai"],
};

export default nextConfig;
