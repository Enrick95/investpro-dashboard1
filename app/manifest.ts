import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InvestPro Trading",
    short_name: "InvestPro",
    description: "InvestPro Dashboard Application",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#07070a",
    theme_color: "#07070a",
    orientation: "portrait",
    icons: [
      {
        src: "/logo.webp",
        sizes: "any",
        type: "image/webp",
      },
    ],
  };
}