import type { NextConfig } from "next";

// Sharp's native binding loads libvips-cpp.so at runtime via dlopen, which
// Next's tracer cannot see: it copies the package's JS files but not the shared
// library. Include the library from its real pnpm path only (not the hoisted
// symlink) so it is packaged once.
const sharpNativeLibrary = [
  "./node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/lib/**",
];

// Browser runtime assets are needed only by the preview API handlers.
const previewBrowserFiles = [
  "./node_modules/playwright-core/**",
  "./node_modules/@sparticuz/chromium/bin/**",
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/unfurl": [...previewBrowserFiles, ...sharpNativeLibrary],
    "/api/wishlist-items/enrich": [...previewBrowserFiles, ...sharpNativeLibrary],
    "/api/wishlist-images/upload": [...sharpNativeLibrary],
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
