import type { NextConfig } from "next";

const wishlistImageRuntimeFiles = [
  "./node_modules/sharp/**",
  "./node_modules/.pnpm/sharp@*/node_modules/sharp/**",
  "./node_modules/@img/sharp-linux-x64/**",
  "./node_modules/.pnpm/@img+sharp-linux-x64@*/node_modules/@img/sharp-linux-x64/**",
  "./node_modules/@img/sharp-libvips-linux-x64/**",
  "./node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/**",
];

const nextConfig: NextConfig = {
  // The wishlist server actions import the Playwright renderer for link previews.
  // Trace the complete Playwright package (including browsers.json) and Chromium
  // runtime assets into every route that loads those actions or the unfurl helper.
  outputFileTracingIncludes: {
    "/api/unfurl": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/wishlist-items/enrich": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/bin/**",
      ...wishlistImageRuntimeFiles,
    ],
    "/api/wishlist-images/upload": [
      ...wishlistImageRuntimeFiles,
    ],
    "/wishlists/*": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/bin/**",
      ...wishlistImageRuntimeFiles,
    ],
    "/wishlists/*/recipient": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/bin/**",
      ...wishlistImageRuntimeFiles,
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
