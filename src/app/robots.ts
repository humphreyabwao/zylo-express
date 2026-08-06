import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/utils";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Transactional and personalised surfaces have no crawl value, and
        // /search would generate unbounded near-duplicate URLs.
        disallow: ["/cart", "/checkout", "/account", "/search", "/api"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
