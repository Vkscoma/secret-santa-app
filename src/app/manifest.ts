import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Secret Santa",
    short_name: "Secret Santa",
    description: "A little holiday magic for the people you love.",
    start_url: "/",
    display: "standalone",
    background_color: "oklch(0.985 0.004 200)",
    theme_color: "oklch(0.36 0.09 158)",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
