import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap eyebrow-sm px-2.5 py-1 transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        outline: "border border-border-strong text-foreground",
        accent: "bg-champagne text-obsidian",
        muted: "bg-secondary text-secondary-foreground",
        inverse: "bg-porcelain text-obsidian",
        destructive: "bg-destructive text-destructive-foreground",
        /* Merchandising flags sit directly on imagery — no fill, just type. */
        editorial: "bg-transparent p-0 text-champagne-dark",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
