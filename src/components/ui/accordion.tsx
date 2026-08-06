"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

const Accordion = AccordionPrimitive.Root;

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b border-hairline", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  /** `prose` drops the wide-tracked micro-type — used for long questions. */
  tone = "label",
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  tone?: "label" | "prose";
}) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group flex flex-1 items-center justify-between gap-4 py-5 text-left",
          "text-foreground transition-opacity duration-400 hover:opacity-60",
          "focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ring",
          tone === "label"
            ? "eyebrow"
            : "font-sans text-base font-normal leading-snug",
          className
        )}
        {...props}
      >
        {children}
        <Plus
          className="size-4 shrink-0 transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[state=open]:rotate-135"
          strokeWidth={1}
          aria-hidden
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div
        className={cn(
          "pb-6 pt-0 text-sm font-light leading-relaxed text-muted-foreground",
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
