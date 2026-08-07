"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Menu, Search, ShoppingBag, User } from "lucide-react";

import { MAIN_NAV } from "@/data/navigation";
import { useCartStore } from "@/store/cart-store";
import { useUiStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { CurrencySwitcher } from "@/components/commerce/currency-switcher";
import { MegaMenu } from "@/components/layout/mega-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/** Routes whose hero sits under a transparent header. */
const TRANSPARENT_ROUTES = ["/"];

const HOVER_CLOSE_DELAY = 140;

export function Header() {
  const pathname = usePathname();
  const openCart = useUiStore((s) => s.openCart);
  const openSearch = useUiStore((s) => s.openSearch);
  const openNav = useUiStore((s) => s.openNav);
  const openMenu = useUiStore((s) => s.openMenu);
  const setOpenMenu = useUiStore((s) => s.setOpenMenu);

  const lines = useCartStore((s) => s.lines);
  const hydrated = useCartStore((s) => s.hydrated);
  const itemCount = hydrated
    ? lines.reduce((sum, line) => sum + line.quantity, 0)
    : 0;

  const [scrolled, setScrolled] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const overHero = TRANSPARENT_ROUTES.includes(pathname);
  const transparent = overHero && !scrolled && !openMenu;

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    setOpenMenu(null);
  }, [pathname, setOpenMenu]);

  React.useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenMenu(null), HOVER_CLOSE_DELAY);
  };

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const activeItem = MAIN_NAV.find((item) => item.label === openMenu);

  return (
    <header
      onMouseLeave={scheduleClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpenMenu(null);
      }}
      className={cn(
        "sticky top-0 z-40 w-full transition-[background-color,border-color,color] duration-600 ease-[cubic-bezier(0.16,1,0.3,1)]",
        transparent
          ? "border-b border-white/15 bg-transparent text-porcelain"
          : "border-b border-hairline bg-background/92 text-foreground backdrop-blur-md"
      )}
    >
      {/* One horizontal row: wordmark, navigation, utilities. */}
      <div className="container-shell flex h-16 items-center gap-2 sm:gap-4 lg:h-[4.5rem] lg:gap-10">
        <button
          type="button"
          onClick={openNav}
          aria-label="Open menu"
          className="-ml-2.5 grid size-10 shrink-0 place-items-center transition-opacity duration-400 hover:opacity-60 lg:hidden"
        >
          <Menu className="size-5" strokeWidth={1.25} />
        </button>

        <Logo className="shrink-0 text-current" />

        <nav aria-label="Main" className="hidden min-w-0 flex-1 lg:block">
          {/* Scrolls rather than wraps if the viewport cannot take every item. */}
          <ul className="no-scrollbar flex items-center gap-x-4 overflow-x-auto xl:gap-x-6 2xl:gap-x-8">
            {MAIN_NAV.map((item) => {
              const isOpen = openMenu === item.label;
              const isActive =
                item.href !== "/" && pathname.startsWith(item.href);

              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onMouseEnter={() => {
                      cancelClose();
                      setOpenMenu(item.columns ? item.label : null);
                    }}
                    onFocus={() =>
                      setOpenMenu(item.columns ? item.label : null)
                    }
                    aria-expanded={item.columns ? isOpen : undefined}
                    className={cn(
                      "relative block whitespace-nowrap py-2 text-[0.625rem] uppercase leading-[1.4] tracking-[0.18em] transition-opacity duration-400 hover:opacity-100 xl:tracking-[0.22em]",
                      isOpen || isActive ? "opacity-100" : "opacity-70"
                    )}
                  >
                    {item.label}
                    <span
                      className={cn(
                        "absolute inset-x-0 -bottom-0.5 h-px origin-left bg-current transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        isOpen || isActive ? "scale-x-100" : "scale-x-0"
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          {/* The announcement bar carries the currency switcher from md up and
              hides it below, which left a phone with no way to change currency
              at all. This is the same control on the other side of that
              breakpoint, so exactly one is visible at any width. */}
          <CurrencySwitcher className="mr-1 md:hidden" />

          {/* Desktop only: below lg the hamburger drawer carries it instead,
              so the two never both appear. */}
          <ThemeToggle className="hidden lg:grid" />

          {/* size-9 on a phone, size-10 from sm.

              With the currency switcher now in this row, four 40px boxes plus
              the logo and the drawer button came to more than a 320px screen
              has, and the bag button — which is pulled 10px right for optical
              alignment — ended up past the edge. 36px boxes give the row the
              width it needs and read as tidier besides. */}
          <button
            type="button"
            onClick={openSearch}
            aria-label="Search"
            className="grid size-9 place-items-center transition-opacity duration-400 hover:opacity-60 sm:size-10"
          >
            <Search className="size-[1.05rem]" strokeWidth={1.25} />
          </button>

          <Link
            href="/account/wishlist"
            aria-label="Saved items"
            className="hidden size-10 place-items-center transition-opacity duration-400 hover:opacity-60 sm:grid"
          >
            <Heart className="size-[1.05rem]" strokeWidth={1.25} />
          </Link>

          <Link
            href="/account"
            aria-label="Account"
            className="grid size-9 place-items-center transition-opacity duration-400 hover:opacity-60 sm:size-10"
          >
            <User className="size-[1.05rem]" strokeWidth={1.25} />
          </Link>

          <button
            type="button"
            onClick={openCart}
            aria-label={`Shopping bag, ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
            className="relative -mr-1.5 grid size-9 place-items-center transition-opacity duration-400 hover:opacity-60 sm:-mr-2.5 sm:size-10"
          >
            <ShoppingBag className="size-[1.05rem]" strokeWidth={1.25} />
            {itemCount > 0 && (
              <span
                className={cn(
                  "absolute right-0.5 top-1 grid min-w-[1.15rem] place-items-center rounded-full",
                  "bg-[#d12d2d] px-1 text-[0.625rem] font-semibold leading-[1.15rem] text-white",
                  "ring-2 ring-background"
                )}
              >
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div onMouseEnter={cancelClose}>
        {MAIN_NAV.filter((item) => item.columns).map((item) => (
          <MegaMenu
            key={item.label}
            item={item}
            open={activeItem?.label === item.label}
            onNavigate={() => setOpenMenu(null)}
          />
        ))}
      </div>
    </header>
  );
}
