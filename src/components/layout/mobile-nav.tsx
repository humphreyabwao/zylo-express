"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Heart, MapPin, User } from "lucide-react";

import { MAIN_NAV } from "@/data/navigation";
import { useIsNavOpen, useUiStore } from "@/store/ui-store";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

export function MobileNav() {
  const open = useIsNavOpen();
  const closeOverlay = useUiStore((s) => s.closeOverlay);
  const pathname = usePathname();

  // Route changes dismiss the drawer.
  React.useEffect(() => {
    if (open) closeOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && closeOverlay()}>
      <SheetContent side="left" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto px-6 py-2 sm:px-8">
          <Accordion type="multiple" className="w-full">
            {MAIN_NAV.map((item) =>
              item.columns?.length ? (
                <AccordionItem key={item.label} value={item.label}>
                  <AccordionTrigger>{item.label}</AccordionTrigger>
                  <AccordionContent>
                    <Link
                      href={item.href}
                      className="mb-4 inline-block text-sm font-light text-champagne-dark underline underline-offset-4"
                    >
                      Shop all {item.label}
                    </Link>

                    <div className="space-y-6">
                      {item.columns.map((column) => (
                        <div key={column.heading}>
                          <h4 className="eyebrow-sm mb-3 text-muted-foreground">
                            {column.heading}
                          </h4>
                          <ul className="space-y-2.5">
                            {column.links.map((link) => (
                              <li key={link.href + link.label}>
                                <Link
                                  href={link.href}
                                  className="text-sm font-light text-foreground"
                                >
                                  {link.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ) : (
                <div
                  key={item.label}
                  className="border-b border-hairline"
                >
                  <Link
                    href={item.href}
                    className="block py-5 eyebrow text-foreground"
                  >
                    {item.label}
                  </Link>
                </div>
              )
            )}
          </Accordion>

          <Separator className="my-8" />

          <ul className="space-y-5 pb-8">
            <li>
              <Link
                href="/account"
                className="flex items-center gap-3 eyebrow-sm text-foreground"
              >
                <User className="size-4" strokeWidth={1.25} />
                My Account
              </Link>
            </li>
            <li>
              <Link
                href="/account/wishlist"
                className="flex items-center gap-3 eyebrow-sm text-foreground"
              >
                <Heart className="size-4" strokeWidth={1.25} />
                Saved Items
              </Link>
            </li>
            <li>
              <Link
                href="/boutiques"
                className="flex items-center gap-3 eyebrow-sm text-foreground"
              >
                <MapPin className="size-4" strokeWidth={1.25} />
                Find a Boutique
              </Link>
            </li>
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
