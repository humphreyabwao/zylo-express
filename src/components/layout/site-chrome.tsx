"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { Header } from "@/components/layout/header";
import { CheckoutHeader } from "@/components/layout/checkout-header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { SearchOverlay } from "@/components/search/search-overlay";

/** Routes that trade the full navigation for a distraction-free frame. */
const MINIMAL_ROUTES = ["/checkout"];

/**
 * Routes that render with no storefront frame whatsoever.
 *
 * The admin portal brings its own shell, type scale and navigation. Beyond
 * looking wrong, inheriting the storefront chrome would mount the cart drawer,
 * search overlay and mobile nav inside the dashboard — shopper state and
 * shopper keyboard shortcuts in an operator tool.
 */
const BARE_ROUTES = [
  "/admin",
  /**
   * The public tracking page.
   *
   * Opened from an email, on a phone, to answer one question. A header, a
   * mega-menu and a newsletter sign-up are all in the way of that — and the
   * cart drawer and search overlay are shopper state on a page reached with a
   * bearer token, which may not be the account holder's browser at all.
   */
  "/track",
];

/**
 * Client boundary only so the frame can react to the route. `children` is
 * still rendered on the server and passed straight through, so no page code
 * is pulled into the client bundle by this.
 */
export function SiteChrome({
  children,
  categories,
  announcements,
}: {
  children: React.ReactNode;
  /** Server-fetched in the root layout; forwarded to the search overlay. */
  categories: { slug: string; name: string }[];
  /** From `site_settings`, so the bar is editable without a deploy. */
  announcements: string[];
}) {
  const pathname = usePathname();
  const minimal = MINIMAL_ROUTES.some((route) => pathname.startsWith(route));
  const bare = BARE_ROUTES.some((route) => pathname.startsWith(route));

  if (bare) return <>{children}</>;

  return (
    <>
      <a
        href="#main"
        className="sr-only-focusable fixed left-4 top-4 z-100 bg-primary px-5 py-3 eyebrow-sm text-primary-foreground"
      >
        Skip to content
      </a>

      {minimal ? (
        <CheckoutHeader />
      ) : (
        <>
          <AnnouncementBar announcements={announcements} />
          <Header />
        </>
      )}

      <main id="main" className="min-h-[60vh] flex-1">
        {children}
      </main>

      {minimal ? <CheckoutFooter /> : <Footer />}

      {/* Checkout keeps its distraction-free frame — no way out but forward. */}
      {!minimal && <BottomNav />}

      <MobileNav />
      <CartDrawer />
      <SearchOverlay categories={categories.slice(0, 6)} />
    </>
  );
}

function CheckoutFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="container-shell flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
        <p className="eyebrow-sm text-muted-foreground">© {new Date().getFullYear()} Zylo</p>
        <ul className="flex flex-wrap items-center gap-x-7 gap-y-2">
          {[
            { href: "/legal/privacy", label: "Privacy" },
            { href: "/legal/terms", label: "Terms" },
            { href: "/help/contact", label: "Need help?" },
          ].map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="eyebrow-sm text-muted-foreground transition-colors duration-400 hover:text-foreground"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
