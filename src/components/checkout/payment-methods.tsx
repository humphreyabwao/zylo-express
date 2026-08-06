"use client";

import * as React from "react";
import type { Control } from "react-hook-form";
import { CreditCard, Loader2, Smartphone, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CheckoutValues, PaymentMethodValue } from "@/lib/validation";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

/**
 * How the customer pays.
 *
 * There are no card fields here by design. Choosing "card" hands the customer
 * to Paystack's hosted page, so no card number is ever typed into this origin
 * — which is both the smaller PCI footprint and the reason this component is
 * only a selector.
 */

interface MethodSpec {
  id: PaymentMethodValue;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  note: string;
}

const METHODS: MethodSpec[] = [
  {
    id: "card",
    name: "Card",
    description: "Visa, Mastercard and American Express.",
    icon: CreditCard,
    note: "You will be taken to our payment provider to enter your card, then returned here.",
  },
  {
    id: "mpesa",
    name: "M-Pesa",
    description: "Pay from your Safaricom or Airtel line.",
    icon: Smartphone,
    note: "We send a prompt to your phone. Enter your M-Pesa PIN to authorise it.",
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Pay with your PayPal balance or a linked account.",
    icon: Wallet,
    note: "You will be taken to PayPal to approve the payment, then returned here.",
  },
];

export function PaymentMethods({
  control,
  available,
  selected,
}: {
  control: Control<CheckoutValues>;
  /** Methods whose provider is actually configured on the server. */
  available: PaymentMethodValue[];
  selected: PaymentMethodValue;
}) {
  const offered = METHODS.filter((method) => available.includes(method.id));

  if (!offered.length) {
    return (
      <p className="border border-hairline px-5 py-4 text-sm font-light text-muted-foreground">
        No payment method is available right now. Please contact a client
        advisor to complete this order.
      </p>
    );
  }

  return (
    <FormField
      control={control}
      name="paymentMethod"
      render={({ field }) => (
        <FormItem>
          <div className="grid gap-3 sm:grid-cols-3">
            {offered.map((method) => {
              const active = field.value === method.id;
              const Icon = method.icon;

              return (
                <label
                  key={method.id}
                  className={cn(
                    "flex cursor-pointer flex-col gap-2 border p-4 transition-colors duration-400",
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

                  <span className="flex items-center justify-between gap-3">
                    <Icon
                      className={cn(
                        "size-5",
                        active ? "text-foreground" : "text-muted-foreground"
                      )}
                      strokeWidth={1.25}
                    />
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-full border",
                        active ? "border-foreground" : "border-input"
                      )}
                      aria-hidden
                    >
                      {active && (
                        <span className="size-2 rounded-full bg-foreground" />
                      )}
                    </span>
                  </span>

                  <span className="text-sm font-semibold text-foreground">
                    {method.name}
                  </span>
                  <span className="text-xs font-light leading-relaxed text-muted-foreground">
                    {method.description}
                  </span>
                </label>
              );
            })}
          </div>

          <FormMessage />

          <p className="mt-4 text-sm font-light leading-relaxed text-muted-foreground">
            {METHODS.find((method) => method.id === selected)?.note}
          </p>
        </FormItem>
      )}
    />
  );
}

export function MpesaPhoneField({
  control,
}: {
  control: Control<CheckoutValues>;
}) {
  return (
    <FormField
      control={control}
      name="mpesaPhone"
      render={({ field }) => (
        <FormItem className="mt-6">
          <FormLabel>M-Pesa number</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={field.value ?? ""}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="07XX XXX XXX"
            />
          </FormControl>
          <FormDescription>
            The prompt is sent here. Any of 07…, +254… or 254… works.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * The wait between sending an STK push and the customer entering their PIN.
 *
 * Blocking rather than dismissible: the payment is live on their handset, and
 * a customer who wanders back into the form and resubmits gets a second order
 * holding a second lot of stock. "Cancel" is explicit and tells the server, so
 * the first attempt's inventory is released rather than stranded.
 */
export function MpesaPrompt({
  phone,
  displayText,
  elapsedSeconds,
  onCancel,
  cancelling,
}: {
  phone: string;
  displayText: string;
  elapsedSeconds: number;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-md border border-hairline bg-background p-8 text-center lg:p-10">
        <Loader2
          className="mx-auto size-8 animate-spin text-champagne-dark"
          strokeWidth={1}
        />

        <h2 className="mt-7 font-display text-2xl font-light">
          Check your phone
        </h2>

        <p className="mt-4 text-sm font-light leading-relaxed text-muted-foreground">
          {displayText}
        </p>

        <p className="mt-5 border border-hairline px-4 py-3 text-sm font-semibold tabular-nums">
          {phone}
        </p>

        <p className="mt-6 text-xs font-light text-muted-foreground tabular-nums">
          Waiting for authorisation · {formatElapsed(elapsedSeconds)}
        </p>

        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="link-draw mt-8 eyebrow-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {cancelling ? "Cancelling…" : "Cancel this payment"}
        </button>

        <p className="mt-6 text-xs font-light leading-relaxed text-muted-foreground">
          Do not close this page. If you dismissed the prompt by mistake,
          cancel here and try again.
        </p>
      </div>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
