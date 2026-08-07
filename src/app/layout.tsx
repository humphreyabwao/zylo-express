import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import { cormorant, jost } from "@/lib/fonts";
import { getCategories } from "@/lib/catalog";
import { getStoreSettingsWithLiveRates } from "@/lib/settings";
import { resolveCurrency, CURRENCY_COOKIE } from "@/lib/currency";
import { CurrencyProvider } from "@/components/commerce/currency-provider";
import { absoluteUrl } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/layout/site-chrome";

import "./globals.css";

const SITE_NAME = "ZYLO Express";
const SITE_DESCRIPTION =
  "Leather goods, timepieces, jewellery, electronics, footwear and beauty, sourced from ateliers and workshops worldwide. Every piece shows where it ships from and how long dispatch takes.";

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl("/")),
  title: {
    default: `${SITE_NAME} — Sourced worldwide, shipped to you`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "online shopping",
    "international shipping",
    "leather goods",
    "fine jewellery",
    "timepieces",
    "electronics",
    "footwear",
    "hair and beauty",
  ],
  authors: [{ name: SITE_NAME }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Sourced worldwide, shipped to you`,
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
    locale: "en_US",
    images: [
      {
        url: "/media/campaign/hero-primary.jpg",
        width: 2400,
        height: 1500,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Sourced worldwide, shipped to you`,
    description: SITE_DESCRIPTION,
    images: ["/media/campaign/hero-primary.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Let Google use full-size image and video previews for product pages.
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: { telephone: false, address: false, email: false },
};

/**
 * Site-wide structured data.
 *
 * Emitted once in the root layout rather than per page: Organization and
 * WebSite describe the site itself, and repeating them on every route gives
 * search engines conflicting duplicates to reconcile.
 *
 * The SearchAction is what can earn a sitelinks search box in results.
 */
const siteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": absoluteUrl("/#organization"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
      logo: absoluteUrl("/media/campaign/hero-primary.jpg"),
      description: SITE_DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      url: absoluteUrl("/"),
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      publisher: { "@id": absoluteUrl("/#organization") },
      inLanguage: "en",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: absoluteUrl("/search?q={search_term_string}"),
        },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Fetched here so the search overlay and mobile nav can render category
  // links without importing the catalogue into the client bundle.
  const [categoryRows, settings, cookieStore] = await Promise.all([
    getCategories(),
    getStoreSettingsWithLiveRates(),
    cookies(),
  ]);

  const categories = categoryRows.map(({ slug, name }) => ({ slug, name }));

  /**
   * Resolved on the server so the first paint is already in the right
   * currency. Doing it on the client would mean every price flashing from the
   * base currency to the shopper's after hydration.
   *
   * `resolveCurrency` re-checks the cookie against the enabled list and the
   * rates, so a currency the operator has since removed stops being served to
   * whoever had already chosen it.
   */
  const currency = resolveCurrency(
    cookieStore.get(CURRENCY_COOKIE)?.value,
    settings.currency
  );

  return (
    <html
      lang="en"
      suppressHydrationWarning
      // globals.css sets `scroll-behavior: smooth` on <html> for in-page anchor
      // links. Without this attribute Next can't tell that apart from an
      // accident, and route transitions animate a scroll to the top instead of
      // jumping — so a new page appears to start mid-scroll. Declaring it lets
      // Next suppress smooth scrolling for navigations while anchors keep it.
      data-scroll-behavior="smooth"
      className={`${cormorant.variable} ${jost.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <script
          type="application/ld+json"
          // Built from constants in this file — no user input reaches it.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
        />
        <Providers>
          <CurrencyProvider
            initialCurrency={currency}
            config={settings.currency}
            freeShippingThreshold={settings.freeShippingThreshold}
          >
            <SiteChrome
              categories={categories}
              announcements={settings.announcements}
            >
              {children}
            </SiteChrome>
          </CurrencyProvider>
        </Providers>
      </body>
    </html>
  );
}
