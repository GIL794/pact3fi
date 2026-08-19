import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/api/", "/pay/"],
    },
    sitemap: "https://pactopus.com/sitemap.xml",
    host: "https://pactopus.com",
  };
}
