"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Tag, X } from "lucide-react";
import { toast } from "sonner";

import { evaluatePromotion } from "@/lib/pricing";
import { useCartStore } from "@/store/cart-store";
import { promotionSchema, type PromotionValues } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export function PromotionForm({
  subtotal,
  className,
}: {
  subtotal: number;
  className?: string;
}) {
  const promotionCode = useCartStore((s) => s.promotionCode);
  const applyPromotion = useCartStore((s) => s.applyPromotion);
  const [open, setOpen] = React.useState(false);

  const form = useForm<PromotionValues>({
    resolver: zodResolver(promotionSchema),
    defaultValues: { code: "" },
  });

  const applied = promotionCode
    ? evaluatePromotion(subtotal, promotionCode)
    : null;

  const onSubmit = (values: PromotionValues) => {
    const result = evaluatePromotion(subtotal, values.code);

    if (result.rejection === "unknown") {
      form.setError("code", { message: "That code is not recognised" });
      return;
    }
    if (result.rejection === "minimum-not-met") {
      form.setError("code", {
        message: "Your bag does not yet meet the minimum for this code",
      });
      return;
    }

    applyPromotion(values.code);
    form.reset();
    setOpen(false);
    toast("Code applied", { description: result.promotion?.label });
  };

  if (applied?.promotion && !applied.rejection) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-4 border border-hairline px-4 py-3.5",
          className
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Tag className="size-3.5 shrink-0 text-champagne-dark" strokeWidth={1.25} />
          <span className="min-w-0">
            <span className="block eyebrow-sm text-foreground">
              {applied.promotion.code}
            </span>
            <span className="block truncate text-xs font-light text-muted-foreground">
              {applied.promotion.label}
            </span>
          </span>
        </span>

        <button
          type="button"
          onClick={() => {
            applyPromotion(null);
            toast("Code removed");
          }}
          aria-label="Remove promotion code"
          className="grid size-8 shrink-0 place-items-center text-muted-foreground transition-colors duration-400 hover:text-foreground"
        >
          <X className="size-3.5" strokeWidth={1.25} />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("link-draw eyebrow-sm text-muted-foreground hover:text-foreground", className)}
      >
        Have a code?
      </button>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn("flex items-end gap-3", className)}
        noValidate
      >
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormControl>
                <Input
                  {...field}
                  placeholder="Promotion code"
                  aria-label="Promotion code"
                  autoCapitalize="characters"
                  className="uppercase"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="outline" className="shrink-0">
          Apply
        </Button>
      </form>
    </Form>
  );
}
