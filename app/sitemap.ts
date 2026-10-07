import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const now=new Date();
  return [{url:"https://investprotrading.fr/",lastModified:now,changeFrequency:"weekly",priority:1},{url:"https://investprotrading.fr/login",lastModified:now,changeFrequency:"monthly",priority:.6},{url:"https://investprotrading.fr/register",lastModified:now,changeFrequency:"monthly",priority:.6}];
}
