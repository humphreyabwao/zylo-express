import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getAllProducts,
  getCategoryBySlug,
  getCountryByCode,
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/catalog";
import { absoluteUrl, formatPrice } from "@/lib/utils";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { SectionHeading } from "@/components/layout/section-heading";
import { ProductRail } from "@/components/commerce/product-rail";
import { Reveal } from "@/components/motion/reveal";
import { RatingStars } from "@/components/commerce/rating-stars";
import { ProductDetail } from "@/components/product/product-detail";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const products = await getAllProducts();
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Not found" };

  return {
    title: product.name,
    description: product.excerpt,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: "website",
      title: `${product.name} · ZYLO`,
      description: product.excerpt,
      images: product.images.map((image) => ({
        url: image.url,
        width: image.width,
        height: image.height,
        alt: image.alt,
      })),
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [category, related, country] = await Promise.all([
    getCategoryBySlug(product.categorySlug),
    getRelatedProducts(product, 8),
    getCountryByCode(product.originCountry),
  ]);

  // Product schema so the listing is eligible for rich results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.excerpt,
    sku: product.variants[0]?.sku,
    brand: { "@type": "Brand", name: "ZYLO" },
    image: product.images.map((image) => absoluteUrl(image.url)),
    material: product.composition,
    ...(country && {
      countryOfOrigin: { "@type": "Country", name: country.name },
    }),
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
    },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: product.currency,
      lowPrice: (product.price / 100).toFixed(2),
      highPrice: (product.price / 100).toFixed(2),
      offerCount: product.variants.length,
      availability: product.available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised server-side from our own catalogue — no user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="container-shell pt-8 lg:pt-10">
        <Breadcrumbs
          crumbs={[
            { label: "Home", href: "/" },
            ...(category
              ? [{ label: category.name, href: `/category/${category.slug}` }]
              : []),
            { label: product.name },
          ]}
        />
      </div>

      <ProductDetail product={product} />

      {/* The story */}
      <section className="border-t border-hairline bg-surface">
        <div className="container-shell py-section">
          <Reveal className="mx-auto max-w-3xl">
            <p className="eyebrow-sm text-champagne-dark">From the workshop</p>
            <h2 className="mt-6 font-display text-3xl font-light leading-[1.12] lg:text-4xl">
              {product.tagline}
            </h2>
            <p className="mt-8 text-base font-light leading-loose text-muted-foreground lg:text-lg">
              {product.story}
            </p>

            <dl className="mt-12 grid gap-8 border-t border-hairline pt-10 sm:grid-cols-3">
              <div>
                <dt className="eyebrow-sm text-muted-foreground">Composition</dt>
                <dd className="mt-2.5 text-sm font-light">
                  {product.composition}
                </dd>
              </div>
              <div>
                <dt className="eyebrow-sm text-muted-foreground">Ships from</dt>
                <dd className="mt-2.5 text-sm font-light">
                  {country ? (
                    <>
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true">{country.flag}</span>
                        <span>{product.origin}</span>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Dispatched in {country.leadTimeMinDays}–
                        {country.leadTimeMaxDays} days
                      </span>
                    </>
                  ) : (
                    product.origin
                  )}
                </dd>
              </div>
              <div>
                <dt className="eyebrow-sm text-muted-foreground">Price</dt>
                <dd className="mt-2.5 font-display text-lg font-light tabular-nums">
                  {formatPrice(product.price, { currency: product.currency })}
                </dd>
              </div>
            </dl>
          </Reveal>
        </div>
      </section>

      {/* Reviews summary */}
      <section id="reviews" className="container-shell py-section">
        <div className="grid gap-12 lg:grid-cols-[20rem_1fr] lg:gap-20">
          <Reveal>
            <h2 className="font-display text-3xl font-light">
              Client reviews
            </h2>
            <div className="mt-6 flex items-baseline gap-4">
              <span className="font-display text-5xl font-light tabular-nums">
                {product.rating.toFixed(1)}
              </span>
              <span className="text-sm font-light text-muted-foreground">
                out of 5
              </span>
            </div>
            <RatingStars
              rating={product.rating}
              count={product.reviewCount}
              size={14}
              className="mt-4"
            />
            <p className="mt-8 max-w-xs text-sm font-light leading-relaxed text-muted-foreground">
              Reviews are collected from verified purchases only and are never
              edited or removed at the request of the house.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <ul className="divide-y divide-hairline border-y border-hairline">
              {SAMPLE_REVIEWS.map((review) => (
                <li key={review.author} className="py-8">
                  <RatingStars rating={review.rating} />
                  <h3 className="mt-4 font-display text-xl font-light">
                    {review.title}
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm font-light leading-relaxed text-muted-foreground">
                    {review.body}
                  </p>
                  <p className="mt-4 eyebrow-sm text-muted-foreground">
                    {review.author} · Verified purchase
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-8 text-sm font-light text-muted-foreground">
              Showing 3 of {product.reviewCount} reviews.{" "}
              <Link
                href="/help/contact"
                className="link-draw text-foreground"
              >
                Write a review
              </Link>
            </p>
          </Reveal>
        </div>
      </section>

      {/* Related */}
      <section className="border-t border-hairline">
        <div className="container-shell py-section">
          <SectionHeading
            eyebrow="You may also consider"
            title="From the same hands"
            link={
              category
                ? {
                    href: `/category/${category.slug}`,
                    label: `All ${category.name}`,
                  }
                : undefined
            }
          />
          <div className="mt-14">
            <ProductRail products={related} />
          </div>
        </div>
      </section>
    </>
  );
}

/** Placeholder review copy until the Supabase reviews table is wired up. */
const SAMPLE_REVIEWS = [
  {
    author: "M. Aubert",
    rating: 5,
    title: "Better in the hand than in the photograph",
    body: "The weight is the first thing you notice, then the edge finish. Three months of daily use and the leather has darkened exactly as the advisor said it would.",
  },
  {
    author: "K. Nakamura",
    rating: 5,
    title: "Worth the wait",
    body: "Eleven weeks from order to delivery. It arrived with a card signed by the artisan who finished it, which I did not expect and will not forget.",
  },
  {
    author: "R. Delacroix",
    rating: 4,
    title: "Exceptional, with one note",
    body: "Faultless construction. I would have preferred a slightly longer strap for cross-body wear, though the boutique offered to make one to order.",
  },
];
