import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Arca",
    short_name: "Arca",
    description: "Personal finance overview",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f6",
    theme_color: "#f4f6f6",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
