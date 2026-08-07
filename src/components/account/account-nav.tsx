"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  LayoutGrid,
  LogOut,
  MapPin,
  Package,
  Settings,
  type LucideIcon,
} from "lucide-react";

import { signOut } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/account", label: "Overview", icon: LayoutGrid },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/wishlist", label: "Saved", icon: Heart },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/settings", label: "Settings", icon: Settings },
];

export function AccountNav() {
  const pathname = usePathname();
  const [signingOut, startSignOut] = React.useTransition();

  return (
    <nav aria-label="Account">
      {/* Scrollable row on mobile, stacked rail from lg. Icons earn their
          place on narrow screens where labels get cramped.

          The negative margin has to equal `container-shell`'s padding at the
          same breakpoint, or the row does not line up with the content under
          it. It was a flat -mx-5 (20px) against a container that pads 12px on
          a phone, 24px from sm and 40px from md — so the tabs sat 8px left of
          everything below them and bled 8px off the screen. Matching the three
          steps is what squares the left and right edges. */}
      <ul className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-3 sm:-mx-6 sm:px-6 md:-mx-10 md:px-10 lg:mx-0 lg:flex-col lg:gap-0.5 lg:px-0">
        {LINKS.map((link) => {
          const active =
            link.href === "/account"
              ? pathname === "/account"
              : pathname.startsWith(link.href);
          const Icon = link.icon;

          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 whitespace-nowrap px-3.5 py-3 eyebrow-sm transition-colors duration-400 lg:px-4",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-champagne-dark" : ""
                  )}
                  strokeWidth={1.25}
                />
                {link.label}
              </Link>
            </li>
          );
        })}

        <li className="shrink-0 lg:mt-8 lg:border-t lg:border-hairline lg:pt-4">
          {/*
            A form posting to a Server Action, not a fetch. Sign-out clears an
            httpOnly cookie, which only the server can do, and this keeps
            working if JavaScript fails to load.
          */}
          <form
            action={(formData) => startSignOut(() => signOut(formData))}
          >
            <button
              type="submit"
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 whitespace-nowrap px-3.5 py-3 eyebrow-sm text-muted-foreground transition-colors duration-400 hover:text-foreground disabled:opacity-50 lg:px-4"
            >
              <LogOut className="size-4 shrink-0" strokeWidth={1.25} />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </form>
        </li>
      </ul>
    </nav>
  );
}
