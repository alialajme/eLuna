import type { NextConfig } from "next";
import { securityHeadersConfig } from "@e-luna/config/security";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@e-luna/ui", "@e-luna/auth", "@e-luna/db", "@e-luna/ai", "@e-luna/observability"],
  async headers() {
    return securityHeadersConfig();
  },
  images: {
    // Demo product/material photos come from loremflickr (redirects to Flickr's CDN).
    remotePatterns: [
      { protocol: "https", hostname: "loremflickr.com" },
      { protocol: "https", hostname: "*.staticflickr.com" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
