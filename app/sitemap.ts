import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

const ROUTES = ["", "/funding", "/lab", "/method"];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
