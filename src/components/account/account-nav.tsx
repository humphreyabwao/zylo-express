"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/wishlist", label: "Saved Items" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/settings", label: "Settings" },
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account">
      {/* Horizontal on mobile, stacked from lg */}
      <ul className="no-scrollbar -mx-5 flex gap-6 overflow-x-auto px-5 lg:mx-0 lg:flex-col lg:gap-0 lg:px-0">
        {LINKS.map((link) => {
          const active =
            link.href === "/account"
              ? pathname === "/account"
              : pathname.startsWith(link.href);

          return (
            <li key={link.href} className="shrink-0 lg:border-b lg:border-hairline">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block whitespace-nowrap py-4 eyebrow-sm transition-colors duration-400",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-px origin-left bg-foreground transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] lg:hidden",
                    active ? "scale-x-100" : "scale-x-0"
                  )}
                />
              </Link>
            </li>
          );
        })}

        <li className="shrink-0 lg:mt-6">
          <button
            type="button"
            onClick={() =>
              toast("Sign-out is not connected yet", {
                description: "Supabase Auth is wired in the next phase.",
              })
            }
            className="flex items-center gap-2.5 whitespace-nowrap py-4 eyebrow-sm text-muted-foreground transition-colors duration-400 hover:text-foreground lg:py-0"
          >
            <LogOut className="size-3.5" strokeWidth={1.25} />
            Sign out
          </button>
        </li>
      </ul>
    </nav>
  );
}
