"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-500",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-400",
        className
      )}
      {...props}
    />
  );
}

const sheetVariants = cva(
  [
    "fixed z-50 flex flex-col gap-0 bg-background shadow-[0_0_60px_rgba(0,0,0,0.18)]",
    "transition-transform ease-[cubic-bezier(0.16,1,0.3,1)]",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=open]:duration-600 data-[state=closed]:duration-450",
  ].join(" "),
  {
    variants: {
      side: {
        right:
          "inset-y-0 right-0 h-full w-full border-l sm:max-w-[30rem] data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
        left: "inset-y-0 left-0 h-full w-full border-r sm:max-w-[26rem] data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
        top: "inset-x-0 top-0 h-auto border-b data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
        bottom:
          "inset-x-0 bottom-0 h-auto border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
      },
    },
    defaultVariants: { side: "right" },
  }
);

interface SheetContentProps
  extends React.ComponentProps<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  showClose?: boolean;
}

function SheetContent({
  className,
  children,
  side = "right",
  showClose = true,
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        {showClose && (
          <SheetPrimitive.Close
            className={cn(
              "absolute right-5 top-5 z-10 grid size-9 place-items-center",
              "text-muted-foreground transition-colors duration-400 hover:text-foreground",
              "focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ring"
            )}
          >
            <X className="size-4" strokeWidth={1.25} />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b border-hairline px-6 py-5 sm:px-8",
        className
      )}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex shrink-0 flex-col gap-3 border-t border-hairline px-6 py-6 sm:px-8",
        className
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("eyebrow text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm font-light text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
