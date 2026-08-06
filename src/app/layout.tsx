import type { Metadata, Viewport } from "next";

import { cormorant, jost } from "@/lib/fonts";
import { absoluteUrl } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/layout/site-chrome";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl("/")),
  title: {
    default: "ZYLO — Luxury Maison",
    template: "%s · ZYLO",
  },
  description:
    "Leather goods, timepieces, fine jewellery and ready-to-wear, hand-finished in our European ateliers. Complimentary insured delivery worldwide.",
  keywords: [
    "luxury",
    "leather goods",
    "fine jewellery",
    "timepieces",
    "ready-to-wear",
    "maison",
  ],
  authors: [{ name: "ZYLO" }],
  openGraph: {
    type: "website",
    siteName: "ZYLO",
    title: "ZYLO — Luxury Maison",
    description:
      "Hand-finished leather goods, timepieces, fine jewellery and ready-to-wear.",
    url: absoluteUrl("/"),
    images: [
      {
        url: "/media/campaign/hero-primary.jpg",
        width: 2400,
        height: 1500,
        alt: "ZYLO",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ZYLO — Luxury Maison",
    description:
      "Hand-finished leather goods, timepieces, fine jewellery and ready-to-wear.",
    images: ["/media/campaign/hero-primary.jpg"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${cormorant.variable} ${jost.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>
          <SiteChrome>{children}</SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
