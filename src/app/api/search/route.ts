import { NextResponse } from "next/server";
import { z } from "zod";

import { searchProducts } from "@/lib/catalog";
import {
  RateLimits,
  clientIdentifier,
  rateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit";

/**
 * Product search for the header overlay.
 *
 * This route exists so the catalogue does not have to. The overlay used to
 * import the query functions directly, which meant every visitor downloaded
 * the entire product list — descriptions, variants and all — just to type in a
 * box. Now the browser sends a string and receives at most six thin results.
 */

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(12).default(6),
});

/** Only what a result row renders. Nothing else leaves the server. */
function toSuggestion(product: {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  price: number;
  currency: string;
  originCountry: string;
  images: { url: string; alt: string }[];
}) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    tagline: product.tagline,
    price: product.price,
    currency: product.currency,
    originCountry: product.originCountry,
    image: product.images[0]
      ? { url: product.images[0].url, alt: product.images[0].alt }
      : null,
  };
}

export async function GET(request: Request) {
  const identifier = await clientIdentifier();
  const limit = await rateLimit("search", identifier, RateLimits.search);

  if (!limit.success) {
    return NextResponse.json(
      { error: "Too many searches. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? "",
    limit: searchParams.get("limit") ?? undefined,
  });

  // A too-short query is normal typing, not an error — return an empty list
  // rather than a 400 the overlay would have to special-case.
  if (!parsed.success) {
    return NextResponse.json(
      { results: [] },
      { headers: rateLimitHeaders(limit) }
    );
  }

  const products = await searchProducts(parsed.data.q, parsed.data.limit);

  return NextResponse.json(
    { results: products.map(toSuggestion) },
    {
      headers: {
        ...rateLimitHeaders(limit),
        // Shared caches may reuse a popular query; the browser should not
        // hold results while someone is still typing.
        "Cache-Control": "private, max-age=0, s-maxage=60",
      },
    }
  );
}
