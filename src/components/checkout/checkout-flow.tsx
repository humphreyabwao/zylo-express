"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Check, Lock, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import type { ShippingSpeed } from "@/lib/types";
import { SHIPPING_METHODS } from "@/lib/pricing";
import { useCartStore } from "@/store/cart-store";
import { checkoutSchema, type CheckoutValues } from "@/lib/validation";
import { cn, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderSummary } from "@/components/cart/order-summary";
import { AddressFields } from "@/components/checkout/address-fields";

const STEPS = [
  { id: "contact", label: "Contact" },
  { id: "delivery", label: "Delivery" },
  { id: "payment", label: "Payment" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/** Fields validated before each step is allowed to advance. */
const STEP_FIELDS: Record<StepId, (keyof CheckoutValues | string)[]> = {
  contact: ["email", "marketingOptIn"],
  delivery: ["shippingAddress", "shippingMethodId", "giftMessage"],
  payment: [
    "cardholder",
    "cardNumber",
    "expiry",
    "cvc",
    "billingSameAsShipping",
  ],
};

const EMPTY_ADDRESS = {
  firstName: "",
  lastName: "",
  company: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "US",
  phone: "",
};

export function CheckoutFlow() {
  const router = useRouter();
  const lines = useCartStore((s) => s.lines);
  const hydrated = useCartStore((s) => s.hydrated);
  const promotionCode = useCartStore((s) => s.promotionCode);
  const setShippingMethod = useCartStore((s) => s.setShippingMethod);
  const getTotals = useCartStore((s) => s.getTotals);
  const clear = useCartStore((s) => s.clear);

  const [step, setStep] = React.useState<StepId>("contact");
  const [completed, setCompleted] = React.useState<StepId[]>([]);

  const form = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    mode: "onBlur",
    defaultValues: {
      email: "",
      marketingOptIn: false,
      shippingAddress: EMPTY_ADDRESS,
      shippingMethodId: "standard",
      giftMessage: "",
      cardholder: "",
      cardNumber: "",
      expiry: "",
      cvc: "",
      billingSameAsShipping: true,
    },
  });

  const shippingMethodId = form.watch("shippingMethodId");
  const billingSame = form.watch("billingSameAsShipping");

  // Keep the store in step with the form so the summary reprices live.
  React.useEffect(() => {
    setShippingMethod(shippingMethodId as ShippingSpeed);
  }, [shippingMethodId, setShippingMethod]);

  // Billing fields are only registered when they are actually needed.
  React.useEffect(() => {
    if (billingSame) form.setValue("billingAddress", undefined);
    else if (!form.getValues("billingAddress"))
      form.setValue("billingAddress", EMPTY_ADDRESS);
  }, [billingSame, form]);

  const totals = getTotals();

  const advance = async (from: StepId, to: StepId) => {
    const valid = await form.trigger(
      STEP_FIELDS[from] as Parameters<typeof form.trigger>[0]
    );
    if (!valid) return;

    setCompleted((current) =>
      current.includes(from) ? current : [...current, from]
    );
    setStep(to);
    document
      .getElementById("checkout-steps")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onSubmit = async (values: CheckoutValues) => {
    // The Supabase Edge Function re-prices the basket and creates the payment
    // intent; this stand-in produces the same reference shape it will return.
    await new Promise((resolve) => setTimeout(resolve, 1400));

    const reference = `ZY-${Date.now().toString(36).toUpperCase().slice(-6)}`;

    try {
      sessionStorage.setItem(
        "zylo.lastOrder",
        JSON.stringify({
          reference,
          email: values.email,
          lines,
          totals,
          shippingAddress: values.shippingAddress,
          shippingMethodId: values.shippingMethodId,
          placedAt: new Date().toISOString(),
        })
      );
    } catch {
      // A blocked storage quota must not prevent the order confirmation.
    }

    clear();
    toast("Order placed", { description: `Reference ${reference}` });
    router.push(`/checkout/confirmation?ref=${reference}`);
  };

  if (!hydrated) {
    return (
      <div className="grid gap-12 lg:grid-cols-[1fr_24rem] lg:gap-16">
        <div className="space-y-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-7 border border-hairline px-8 py-28 text-center">
        <ShoppingBag className="size-9 text-muted-foreground" strokeWidth={0.75} />
        <div className="space-y-3">
          <h2 className="font-display text-3xl font-light">
            There is nothing to check out
          </h2>
          <p className="mx-auto max-w-md text-sm font-light leading-relaxed text-muted-foreground">
            Your bag is empty. Add a piece and we will hold it while you decide.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/collections/all">Browse the collection</Link>
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="grid gap-12 lg:grid-cols-[1fr_24rem] lg:gap-16 xl:gap-20"
      >
        <div id="checkout-steps" className="min-w-0 scroll-mt-28">
          <StepIndicator step={step} completed={completed} onSelect={setStep} />

          {/* 1 — Contact */}
          <StepPanel
            index={1}
            title="Contact"
            open={step === "contact"}
            done={completed.includes("contact")}
            summary={form.getValues("email")}
            onEdit={() => setStep("contact")}
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" autoComplete="email" />
                  </FormControl>
                  <FormDescription>
                    Your order confirmation and tracking are sent here.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="marketingOptIn"
              render={({ field }) => (
                <FormItem className="mt-6">
                  <label className="flex cursor-pointer items-start gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                        className="mt-0.5"
                      />
                    </FormControl>
                    <span className="text-sm font-light leading-relaxed text-muted-foreground">
                      Write to me before each collection. No more than six times
                      a year.
                    </span>
                  </label>
                </FormItem>
              )}
            />

            <Button
              type="button"
              size="lg"
              className="mt-8"
              onClick={() => advance("contact", "delivery")}
            >
              Continue to delivery
            </Button>
          </StepPanel>

          {/* 2 — Delivery */}
          <StepPanel
            index={2}
            title="Delivery"
            open={step === "delivery"}
            done={completed.includes("delivery")}
            summary={(() => {
              const a = form.getValues("shippingAddress");
              return a?.line1 ? `${a.line1}, ${a.city}` : undefined;
            })()}
            onEdit={() => setStep("delivery")}
          >
            <AddressFields control={form.control} prefix="shippingAddress" />

            <Separator className="my-10" />

            <h3 className="eyebrow-sm mb-5 text-muted-foreground">
              Delivery method
            </h3>

            <FormField
              control={form.control}
              name="shippingMethodId"
              render={({ field }) => (
                <FormItem>
                  <div className="space-y-3">
                    {SHIPPING_METHODS.map((method) => {
                      const active = field.value === method.id;
                      const free =
                        method.id === "standard" && totals.subtotal >= 50000;

                      return (
                        <label
                          key={method.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-4 border p-5 transition-colors duration-400",
                            active
                              ? "border-foreground"
                              : "border-input hover:border-border-strong"
                          )}
                        >
                          <input
                            type="radio"
                            name={field.name}
                            value={method.id}
                            checked={active}
                            onChange={() => field.onChange(method.id)}
                            className="sr-only"
                          />
                          <span
                            className={cn(
                              "mt-1 grid size-4 shrink-0 place-items-center rounded-full border",
                              active ? "border-foreground" : "border-input"
                            )}
                            aria-hidden
                          >
                            {active && (
                              <span className="size-2 rounded-full bg-foreground" />
                            )}
                          </span>

                          <span className="flex-1">
                            <span className="flex items-baseline justify-between gap-4">
                              <span className="eyebrow-sm text-foreground">
                                {method.name}
                              </span>
                              <span className="font-display text-sm font-light tabular-nums">
                                {method.price === 0 || free
                                  ? "Complimentary"
                                  : formatPrice(method.price)}
                              </span>
                            </span>
                            <span className="mt-1.5 block text-sm font-light text-muted-foreground">
                              {method.description}
                            </span>
                            <span className="mt-1 block text-xs font-light text-champagne-dark">
                              {method.estimate}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="giftMessage"
              render={({ field }) => (
                <FormItem className="mt-8">
                  <FormLabel>Gift message (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      maxLength={280}
                      placeholder="Hand-written onto a card and enclosed with the piece."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                type="button"
                size="lg"
                onClick={() => advance("delivery", "payment")}
              >
                Continue to payment
              </Button>
              <Button
                type="button"
                size="lg"
                variant="ghost"
                onClick={() => setStep("contact")}
              >
                Back
              </Button>
            </div>
          </StepPanel>

          {/* 3 — Payment */}
          <StepPanel
            index={3}
            title="Payment"
            open={step === "payment"}
            done={false}
            onEdit={() => setStep("payment")}
          >
            <p className="mb-8 flex items-center gap-2.5 text-sm font-light text-muted-foreground">
              <Lock className="size-3.5 shrink-0" strokeWidth={1.25} />
              Encrypted in transit. Card details are never stored by the house.
            </p>

            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="cardholder"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Name on card</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="cc-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cardNumber"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Card number</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        inputMode="numeric"
                        autoComplete="cc-number"
                        placeholder="0000 0000 0000 0000"
                        onChange={(event) =>
                          field.onChange(formatCardNumber(event.target.value))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiry</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        placeholder="MM/YY"
                        maxLength={5}
                        onChange={(event) =>
                          field.onChange(formatExpiry(event.target.value))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cvc"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Security code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        maxLength={4}
                        placeholder="123"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator className="my-10" />

            <FormField
              control={form.control}
              name="billingSameAsShipping"
              render={({ field }) => (
                <FormItem>
                  <label className="flex cursor-pointer items-start gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                        className="mt-0.5"
                      />
                    </FormControl>
                    <span className="text-sm font-light text-foreground">
                      Billing address is the same as delivery
                    </span>
                  </label>
                </FormItem>
              )}
            />

            {!billingSame && (
              <div className="mt-8">
                <h3 className="eyebrow-sm mb-6 text-muted-foreground">
                  Billing address
                </h3>
                <AddressFields
                  control={form.control}
                  prefix="billingAddress"
                  autoCompleteSection="billing"
                />
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              block
              className="mt-10"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting
                ? "Placing order…"
                : `Pay ${formatPrice(totals.total, { currency: totals.currency })}`}
            </Button>

            <p className="mt-5 text-xs font-light leading-relaxed text-muted-foreground">
              By placing this order you accept our{" "}
              <Link href="/legal/terms" className="underline underline-offset-2">
                terms of sale
              </Link>{" "}
              and confirm you have read the{" "}
              <Link href="/help/returns" className="underline underline-offset-2">
                returns policy
              </Link>
              . Made-to-order and engraved pieces are final sale.
            </p>
          </StepPanel>
        </div>

        <div className="lg:sticky lg:top-28 lg:h-fit">
          <OrderSummary
            lines={lines}
            totals={totals}
            showLines
            heading={promotionCode ? "Order summary — code applied" : "Order summary"}
          />
        </div>
      </form>
    </Form>
  );
}

/* ---------------------------------------------------------------- pieces */

function StepIndicator({
  step,
  completed,
  onSelect,
}: {
  step: StepId;
  completed: StepId[];
  onSelect: (id: StepId) => void;
}) {
  return (
    <ol className="mb-12 flex items-center gap-3">
      {STEPS.map((entry, index) => {
        const active = entry.id === step;
        const done = completed.includes(entry.id);
        const reachable = done || active;

        return (
          <li key={entry.id} className="flex flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => reachable && onSelect(entry.id)}
              disabled={!reachable}
              className={cn(
                "flex items-center gap-2.5 eyebrow-sm transition-colors duration-400",
                active
                  ? "text-foreground"
                  : done
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground/50",
                !reachable && "cursor-default"
              )}
            >
              <span
                className={cn(
                  "grid size-6 place-items-center border text-[0.625rem] tabular-nums",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : done
                      ? "border-champagne-dark text-champagne-dark"
                      : "border-input"
                )}
              >
                {done && !active ? (
                  <Check className="size-3" strokeWidth={2} />
                ) : (
                  index + 1
                )}
              </span>
              <span className="hidden sm:inline">{entry.label}</span>
            </button>

            {index < STEPS.length - 1 && (
              <span className="h-px flex-1 bg-hairline" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepPanel({
  index,
  title,
  open,
  done,
  summary,
  onEdit,
  children,
}: {
  index: number;
  title: string;
  open: boolean;
  done: boolean;
  summary?: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "border-t border-hairline py-8",
        index === 1 && "border-t-0 pt-0"
      )}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl font-light">{title}</h2>
        {!open && done && (
          <button
            type="button"
            onClick={onEdit}
            className="link-draw eyebrow-sm text-muted-foreground hover:text-foreground"
          >
            Edit
          </button>
        )}
      </div>

      {!open && summary && (
        <p className="mt-2 truncate text-sm font-light text-muted-foreground">
          {summary}
        </p>
      )}

      {open && <div className="mt-8">{children}</div>}
    </section>
  );
}

/* --------------------------------------------------------------- masking */

function formatCardNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}
