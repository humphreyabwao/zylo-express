import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-12 w-full min-w-0 border-b border-input bg-transparent px-0 py-3",
        "font-sans text-sm font-light text-foreground",
        "placeholder:text-muted-foreground placeholder:font-light",
        "transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:border-border-strong focus:border-foreground focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive",
        "file:mr-3 file:border-0 file:bg-transparent file:text-xs file:uppercase file:tracking-[0.2em]",
        "[&::-webkit-search-cancel-button]:hidden",
        className
      )}
      {...props}
    />
  );
}

export { Input };
