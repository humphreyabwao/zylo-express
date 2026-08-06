"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { useWishlistStore } from "@/store/wishlist-store";
import { cn } from "@/lib/utils";

interface WishlistButtonProps {
  productId: string;
  productName: string;
  className?: string;
  size?: "sm" | "md";
  /** `bare` drops the surface so the button can sit directly on imagery. */
  variant?: "surface" | "bare";
}

export function WishlistButton({
  productId,
  productName,
  className,
  size = "md",
  variant = "surface",
}: WishlistButtonProps) {
  const productIds = useWishlistStore((s) => s.productIds);
  const hydrated = useWishlistStore((s) => s.hydrated);
  const toggle = useWishlistStore((s) => s.toggle);

  // Before rehydration the server and client disagree about saved state, so
  // the filled heart is withheld until localStorage has been read.
  const saved = hydrated && productIds.includes(productId);

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const added = toggle(productId);
    toast(added ? "Added to your list" : "Removed from your list", {
      description: productName,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${productName} from list` : `Save ${productName} to list`}
      className={cn(
        "group/wish grid place-items-center transition-colors duration-500",
        size === "sm" ? "size-8" : "size-10",
        variant === "surface" &&
          "bg-background/80 backdrop-blur-sm hover:bg-background",
        variant === "bare" && "hover:opacity-60",
        className
      )}
    >
      <Heart
        className={cn(
          size === "sm" ? "size-3.5" : "size-4",
          "transition-all duration-500",
          saved ? "fill-champagne-dark text-champagne-dark" : "text-current"
        )}
        strokeWidth={1.25}
      />
    </button>
  );
}
