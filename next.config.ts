import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser runtime assets are needed only by the preview API handlers.
  // Let Next trace Sharp and its native dependencies from their actual imports.
  outputFileTracingIncludes: {
    "/api/unfurl": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/wishlist-items/enrich": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },

  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },

  // Enable compression
  compress: true,

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
