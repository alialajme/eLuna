import type { NextConfig } from "next";
import { securityHeadersConfig } from "@ayvana/config/security";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@ayvana/ui", "@ayvana/auth", "@ayvana/db", "@ayvana/ai", "@ayvana/observability"],
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
