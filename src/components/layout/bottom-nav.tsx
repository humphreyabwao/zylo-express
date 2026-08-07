"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, ShoppingBag, Store, User } from "lucide-react";

import { useCartStore } from "@/store/cart-store";
import { useWishlistStore } from "@/store/wishlist-store";
import { cn } from "@/lib/utils";

type Counter = "cart" | "wishlist";

interface Tab {
  href: string;
  label: string;
  icon: typeof Home;
  /** Which store supplies this tab's badge, if any. */
  counter?: Counter;
}

const TABS: Tab[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/shop", label: "Shop", icon: Store },
  { href: "/cart", label: "Bag", icon: ShoppingBag, counter: "cart" },
  {
    href: "/account/wishlist",
    label: "Saved",
    icon: Heart,
    counter: "wishlist",
  },
  { href: "/account", label: "Account", icon: User },
];

/**
 * Row height. Kept in one place because the spacer below the footer has to
 * match it exactly — content that scrolls under a fixed bar and never clears
 * it is the classic way this pattern goes wrong.
 */
const BAR_HEIGHT = "3.25rem";

/**
 * The tab whose route the shopper is actually on.
 *
 * Longest match wins: `/account/wishlist` sits under `/account`, and without
 * this both tabs would light up at once.
 */
function useActiveHref() {
  const pathname = usePathname();

  return React.useMemo(() => {
    const matched = TABS.filter((tab) =>
      tab.href === "/"
        ? pathname === "/"
        : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
    );

    return matched.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
  }, [pathname]);
}

/**
 * Mobile primary navigation.
 *
 * Five equal tabs, flat, one height, identical on every page.
 *
 * It previously raised the Shop tab onto a gold disc that broke the top edge
 * of the bar, with a blurred halo cut around it and a champagne pill that
 * bloomed under the pointer. That is a loud, contemporary pattern — a floating
 * action button in evening dress — and it made the bar read as tall and busy
 * rather than quiet. A house bar should be furniture: present, unremarkable,
 * the same everywhere. So the disc, the halo and the bloom are gone, the row
 * is 52px instead of 64 plus a 32px bump, and the only mark of the current tab
 * is a hairline above it and the label in full contrast.
 */
export function BottomNav() {
  const activeHref = useActiveHref();

  // Both stores persist to localStorage, so counts are only trustworthy once
  // rehydrated — reading them earlier would render a server/client mismatch.
  const cartLines = useCartStore((s) => s.lines);
  const cartHydrated = useCartStore((s) => s.hydrated);
  const savedIds = useWishlistStore((s) => s.productIds);
  const savedHydrated = useWishlistStore((s) => s.hydrated);

  const counts: Record<Counter, number> = {
    cart: cartHydrated
      ? cartLines.reduce((sum, line) => sum + line.quantity, 0)
      : 0,
    wishlist: savedHydrated ? savedIds.length : 0,
  };

  return (
    <>
      {/* Clears the last of the page from under the fixed bar. */}
      <div
        aria-hidden
        className="lg:hidden"
        style={{
          height: `calc(${BAR_HEIGHT} + env(safe-area-inset-bottom))`,
        }}
      />

      <nav
        aria-label="Primary"
        // Edge to edge, flush to the bottom, with the iOS home indicator
        // accounted for. Below overlays (z-50) so drawers still cover it.
        className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {/* `min-w-0` on the items is load-bearing. A grid item defaults to
            `min-width: auto`, which floors it at min-content — and a
            letter-spaced "Account" is wider than the 64px a fifth of a 320px
            screen allows. Without this the five tabs refuse to shrink, the bar
            measures 405px, and every page inherits a horizontal overflow from
            the nav sitting on top of it. */}
        <ul className="grid grid-cols-5 [&>li]:min-w-0">
          {TABS.map((tab) => {
            const active = tab.href === activeHref;
            const count = tab.counter ? counts[tab.counter] : 0;
            const Icon = tab.icon;

            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={count > 0 ? `${tab.label}, ${count}` : undefined}
                  className={cn(
                    "group relative flex flex-col items-center justify-center gap-1 px-1 outline-none",
                    "transition-colors duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground focus-visible:text-foreground"
                  )}
                  style={{ height: BAR_HEIGHT }}
                >
                  {/* Hairline on the top edge, drawn the way the header
                      underlines its active nav item. The whole of the active
                      state, along with the label's contrast. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 top-0 h-px origin-center bg-foreground transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      active ? "scale-x-100" : "scale-x-0"
                    )}
                  />

                  <span className="relative shrink-0">
                    <Icon className="size-[1.0625rem]" strokeWidth={1.25} />

                    {count > 0 && (
                      // A dot, not a numeral. At this size a two-digit count in
                      // a red circle is the loudest thing on the screen, and
                      // the exact number is on the page the tab leads to.
                      <span
                        aria-hidden
                        className="absolute -right-1 -top-0.5 size-1.5 rounded-full bg-champagne-dark ring-2 ring-background"
                      />
                    )}
                  </span>

                  <span className="tab-label">{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
