import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "https://pactopus.com/", lastModified: now, changeFrequency: "monthly", priority: 1.0 },
    { url: "https://pactopus.com/create", lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: "https://pactopus.com/onboarding", lastModified: now, changeFrequency: "yearly", priority: 0.6 },
    { url: "https://pactopus.com/dashboard", lastModified: now, changeFrequency: "weekly", priority: 0.5 },
  ];
}
