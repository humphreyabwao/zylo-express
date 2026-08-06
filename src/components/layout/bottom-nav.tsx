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
  /** Renders as the raised centre disc instead of a flat icon + label. */
  featured?: boolean;
}

/**
 * Order matters: the featured tab has to land dead centre, so this list is
 * odd-numbered and Shop sits at index 2.
 */
const TABS: Tab[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/cart", label: "Bag", icon: ShoppingBag, counter: "cart" },
  { href: "/shop", label: "Shop", icon: Store, featured: true },
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
const BAR_HEIGHT = "4rem";

/** The icon box a flat tab reserves. The Shop tab reserves the same one. */
const ICON_BOX = "1.15rem";

/** The Shop disc, and the halo it is cut into the bar with. */
const DISC_SIZE = "3.5rem";
const HALO_SIZE = "4.25rem";

/**
 * How far the halo rises above the bar's top edge.
 *
 * Bounded below by the Shop label. A flat tab centres an 18.4px icon, a 6px
 * gap and a 14px label in the 64px row, which puts every label's top edge
 * 37.2px below the bar's. The halo is opaque, so it has to clear that line:
 * at 2rem it ends 1px above the label and the disc inside it — inset 6px —
 * ends 7px above, which is air rather than gold behind the word "Shop".
 *
 * The spacer uses this rather than the disc's own rise because the halo is
 * the taller of the two; sizing to the disc would leave the page scrolling
 * under the halo's top edge.
 */
const HALO_RISE = "2rem";

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
      {/* Clears the last of the page from under the fixed bar and its bump. */}
      <div
        aria-hidden
        className="lg:hidden"
        style={{
          height: `calc(${BAR_HEIGHT} + ${HALO_RISE} + env(safe-area-inset-bottom))`,
        }}
      />

      <nav
        aria-label="Primary"
        // Edge to edge, flush to the bottom, with the iOS home indicator
        // accounted for. Below overlays (z-50) so drawers still cover it.
        // Overflow stays visible — the Shop disc breaks the top edge.
        className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {TABS.map((tab) => {
            const active = tab.href === activeHref;
            const count = tab.counter ? counts[tab.counter] : 0;
            const Icon = tab.icon;

            if (tab.featured) {
              return (
                <li key={tab.href} className="relative">
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    // Same centring as a flat tab, so the Shop label lands on
                    // the same baseline as the other four rather than being
                    // pushed down by the disc.
                    className="group flex flex-col items-center justify-center gap-1.5 outline-none"
                    style={{ height: BAR_HEIGHT }}
                  >
                    {/* Reserves the box a flat tab gives its icon. The disc is
                        drawn around this point but takes no space in flow. */}
                    <span
                      aria-hidden
                      className="shrink-0"
                      style={{ width: ICON_BOX, height: ICON_BOX }}
                    />

                    {/* Halo cut out of the bar, so the disc reads as a notch
                        rather than a sticker sitting on top of it. */}
                    <span
                      aria-hidden
                      className="absolute left-1/2 grid -translate-x-1/2 place-items-center rounded-full bg-background/92 backdrop-blur-md"
                      style={{
                        top: `calc(-1 * ${HALO_RISE})`,
                        width: HALO_SIZE,
                        height: HALO_SIZE,
                      }}
                    >
                      {/* Soft champagne bloom that swells on hover. */}
                      <span
                        className={cn(
                          "absolute size-full rounded-full bg-champagne/25 blur-md transition-all duration-600 ease-[cubic-bezier(0.16,1,0.3,1)]",
                          active
                            ? "scale-110 opacity-90"
                            : "scale-75 opacity-0 group-hover:scale-110 group-hover:opacity-100 group-focus-visible:scale-110 group-focus-visible:opacity-100"
                        )}
                      />

                      <span
                        className={cn(
                          "relative grid place-items-center rounded-full text-obsidian",
                          "bg-gradient-to-br from-champagne-light via-champagne to-champagne-dark",
                          "shadow-lg shadow-champagne/35 ring-1 ring-champagne-dark/30",
                          "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                          "group-hover:-translate-y-0.5 group-hover:shadow-champagne/60",
                          "group-hover:from-champagne group-hover:via-champagne-light group-hover:to-champagne",
                          "group-focus-visible:ring-2 group-focus-visible:ring-foreground",
                          "group-active:scale-95 group-active:shadow-md"
                        )}
                        style={{ width: DISC_SIZE, height: DISC_SIZE }}
                      >
                        <Icon className="size-6" strokeWidth={1.5} />
                      </span>
                    </span>

                    {/* `relative` for the same reason the flat tabs use it: the
                        halo is positioned, and a static sibling would be
                        painted over by it whatever the DOM order. */}
                    <span
                      className={cn(
                        "eyebrow-sm relative transition-colors duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        active
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-champagne-dark group-focus-visible:text-champagne-dark"
                      )}
                    >
                      {tab.label}
                    </span>
                  </Link>
                </li>
              );
            }

            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={count > 0 ? `${tab.label}, ${count}` : undefined}
                  className={cn(
                    "group relative flex flex-col items-center justify-center gap-1.5 outline-none",
                    "transition-colors duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-champagne-dark focus-visible:text-champagne-dark"
                  )}
                  style={{ height: BAR_HEIGHT }}
                >
                  {/* Hairline on the top edge, drawn the way the header
                      underlines its active nav item. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 top-0 h-px bg-champagne transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      active ? "scale-x-100" : "scale-x-0"
                    )}
                  />

                  {/* Champagne pill that blooms under the pointer. */}
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-x-2.5 inset-y-1.5 rounded-full",
                      "bg-gradient-to-b from-champagne/22 to-champagne/6 ring-1 ring-champagne/20",
                      "scale-90 opacity-0 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      "group-hover:scale-100 group-hover:opacity-100",
                      "group-focus-visible:scale-100 group-focus-visible:opacity-100"
                    )}
                  />

                  <span
                    className="relative shrink-0 transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-0.5 group-active:scale-90"
                    style={{ width: ICON_BOX, height: ICON_BOX }}
                  >
                    <Icon className="size-full" strokeWidth={1.25} />

                    {count > 0 && (
                      <span
                        className={cn(
                          "absolute -right-2.5 -top-1.5 grid min-w-[1.05rem] place-items-center rounded-full",
                          "bg-[#d12d2d] px-1 text-[0.5625rem] font-semibold leading-[1.05rem] text-white",
                          "ring-2 ring-background"
                        )}
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </span>

                  <span className="eyebrow-sm relative">{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
