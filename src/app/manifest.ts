import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Secret Santa",
    short_name: "Secret Santa",
    description: "A little holiday magic for the people you love.",
    start_url: "/",
    share_target: {
      action: "/wishlists/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    display: "standalone",
    background_color: "oklch(0.985 0.004 200)",
    theme_color: "oklch(0.36 0.09 158)",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
