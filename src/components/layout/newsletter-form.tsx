"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";

import { newsletterSchema, type NewsletterValues } from "@/lib/validation";
import { subscribeToNewsletter } from "@/app/actions/newsletter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface NewsletterFormProps {
  className?: string;
  /** `inverse` is used on dark ground — footer and campaign panels. */
  tone?: "default" | "inverse";
  /**
   * Where this instance sits. Stored against the subscriber so the admin list
   * can tell a footer signup from a campaign one — the two convert very
   * differently, and a single undifferentiated list cannot show that.
   */
  source?: "footer" | "campaign" | "checkout" | "account";
}

export function NewsletterForm({
  className,
  tone = "default",
  source = "footer",
}: NewsletterFormProps) {
  const [subscribed, setSubscribed] = React.useState(false);

  const form = useForm<NewsletterValues>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: { email: "", consent: false },
    mode: "onBlur",
  });

  /**
   * Writes to `newsletter_subscribers`, where the admin list reads it.
   *
   * This used to `await` a 650ms timeout and declare success — the address was
   * never sent anywhere, and "Welcome to the maison" was untrue every time.
   *
   * A resubscribe is reported as success rather than as a conflict; see the
   * action for why that is deliberate and not just forgiving.
   */
  const onSubmit = async (values: NewsletterValues) => {
    const result = await subscribeToNewsletter({ ...values, source });

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof NewsletterValues, { message });
        }
      } else {
        toast.error(result.message);
      }
      return;
    }

    setSubscribed(true);
    toast("Welcome to the maison", {
      description: `We will write to ${values.email} before each collection.`,
    });
    form.reset();
  };

  if (subscribed) {
    return (
      <p
        className={cn(
          "flex items-center gap-3 text-sm font-light",
          tone === "inverse" ? "text-porcelain/80" : "text-muted-foreground",
          className
        )}
      >
        <Check className="size-4 text-champagne" strokeWidth={1.5} />
        You are on the list. Look for us before the next collection.
      </p>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn("space-y-4", className)}
        noValidate
      >
        <div className="flex items-end gap-3">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    autoComplete="email"
                    placeholder="Email address"
                    aria-label="Email address"
                    className={cn(
                      tone === "inverse" &&
                        "border-porcelain/30 text-porcelain placeholder:text-porcelain/50 hover:border-porcelain/60 focus:border-porcelain"
                    )}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            variant={tone === "inverse" ? "inverse" : "default"}
            size="icon"
            disabled={form.formState.isSubmitting}
            aria-label="Subscribe"
            className="shrink-0"
          >
            <ArrowRight className="size-4" strokeWidth={1.25} />
          </Button>
        </div>

        <FormField
          control={form.control}
          name="consent"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-start gap-3">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    className={cn(
                      "mt-0.5",
                      tone === "inverse" &&
                        "border-porcelain/40 data-[state=checked]:border-porcelain data-[state=checked]:bg-porcelain data-[state=checked]:text-obsidian"
                    )}
                  />
                </FormControl>
                <label
                  onClick={() => field.onChange(!field.value)}
                  className={cn(
                    "cursor-pointer text-xs font-light leading-relaxed",
                    tone === "inverse"
                      ? "text-porcelain/60"
                      : "text-muted-foreground"
                  )}
                >
                  I agree to receive news from the maison and accept the{" "}
                  <span className="underline underline-offset-2">
                    privacy policy
                  </span>
                  .
                </label>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
