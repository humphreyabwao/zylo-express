import Link from "next/link";
import { ChevronLeft, Lock } from "lucide-react";

import { Logo } from "@/components/brand/logo";

/** Checkout strips navigation to a single exit — standard for luxury retail. */
export function CheckoutHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-background/92 backdrop-blur-md">
      <div className="container-shell flex h-16 items-center justify-between gap-6 lg:h-20">
        <Link
          href="/cart"
          className="flex items-center gap-2 eyebrow-sm text-muted-foreground transition-colors duration-400 hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" strokeWidth={1.25} />
          <span className="hidden sm:inline">Back to bag</span>
        </Link>

        <Logo />

        <span className="flex items-center gap-2 eyebrow-sm text-muted-foreground">
          <Lock className="size-3.5" strokeWidth={1.25} />
          <span className="hidden sm:inline">Secure</span>
        </span>
      </div>
    </header>
  );
}
