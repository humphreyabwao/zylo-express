import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-sans uppercase tracking-[0.18em] font-normal",
    "transition-[background-color,color,border-color,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
    "disabled:pointer-events-none disabled:opacity-40",
    "focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ring",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/85 border border-primary",
        outline:
          "border border-border-strong bg-transparent text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary",
        accent:
          "bg-champagne text-obsidian border border-champagne hover:bg-champagne-dark hover:border-champagne-dark",
        inverse:
          "bg-porcelain text-obsidian border border-porcelain hover:bg-transparent hover:text-porcelain",
        subtle:
          "bg-secondary text-secondary-foreground hover:bg-muted border border-transparent",
        ghost:
          "bg-transparent text-foreground hover:bg-secondary border border-transparent",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive hover:bg-destructive/85",
        link: "bg-transparent text-foreground underline-offset-4 hover:underline tracking-[0.12em] p-0 h-auto",
      },
      size: {
        sm: "h-9 px-5 text-[0.625rem]",
        default: "h-12 px-8 text-[0.6875rem]",
        lg: "h-14 px-12 text-[0.75rem]",
        icon: "size-11 px-0 tracking-normal",
        "icon-sm": "size-9 px-0 tracking-normal",
      },
      block: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
