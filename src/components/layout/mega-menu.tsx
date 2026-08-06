"use client";

import Image from "next/image";
import Link from "next/link";

import type { NavItem } from "@/data/navigation";
import { cn } from "@/lib/utils";

interface MegaMenuProps {
  item: NavItem;
  open: boolean;
  onNavigate: () => void;
}

export function MegaMenu({ item, open, onNavigate }: MegaMenuProps) {
  if (!item.columns?.length) return null;

  return (
    <div
      // The panel stays mounted so the cross-fade can run in both directions;
      // pointer events are withdrawn while it is closed.
      className={cn(
        "absolute inset-x-0 top-full border-b border-hairline bg-background",
        "transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        open
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-2 opacity-0"
      )}
      aria-hidden={!open}
    >
      <div className="container-shell grid gap-12 py-14 lg:grid-cols-[1fr_auto] lg:gap-20">
        <div
          className={cn(
            "grid gap-x-16 gap-y-10",
            item.columns.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"
          )}
        >
          {item.columns.map((column) => (
            <div key={column.heading}>
              <h3 className="eyebrow-sm mb-5 text-muted-foreground">
                {column.heading}
              </h3>
              <ul className="space-y-3.5">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      onClick={onNavigate}
                      tabIndex={open ? 0 : -1}
                      className="link-draw text-sm font-light text-foreground/85 transition-colors duration-400 hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {item.features?.length ? (
          <div className="flex gap-8">
            {item.features.map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                onClick={onNavigate}
                tabIndex={open ? 0 : -1}
                className="media-zoom group/feature block w-full max-w-xs"
              >
                <div className="relative aspect-4/5 overflow-hidden bg-secondary">
                  <Image
                    src={feature.image}
                    alt={feature.imageAlt}
                    fill
                    sizes="20rem"
                    className="object-cover"
                  />
                </div>
                <p className="eyebrow-sm mt-4 text-champagne-dark">
                  {feature.eyebrow}
                </p>
                <p className="mt-1.5 font-display text-lg font-light leading-snug">
                  {feature.title}
                </p>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
