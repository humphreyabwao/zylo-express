import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-28 w-full resize-y border-b border-input bg-transparent px-0 py-3",
        "font-sans text-sm font-light text-foreground",
        "placeholder:text-muted-foreground placeholder:font-light",
        "transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:border-border-strong focus:border-foreground focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
