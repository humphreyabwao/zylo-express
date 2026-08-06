"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer grid size-4 shrink-0 place-items-center border border-input bg-transparent",
        "transition-colors duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:border-foreground",
        "data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background",
        "data-[state=indeterminate]:border-foreground data-[state=indeterminate]:bg-foreground data-[state=indeterminate]:text-background",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-items-center text-current"
      >
        {props.checked === "indeterminate" ? (
          <Minus className="size-3" strokeWidth={2} />
        ) : (
          <Check className="size-3" strokeWidth={2} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
