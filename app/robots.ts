import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/"], disallow: ["/dashboard/", "/api/", "/auth/"] }], sitemap: "https://investprotrading.fr/sitemap.xml", host: "https://investprotrading.fr" };
}
