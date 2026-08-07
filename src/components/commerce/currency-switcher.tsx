"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { CURRENCY_LABEL } from "@/lib/currency";
import { useCurrency } from "@/components/commerce/currency-provider";

/**
 * The shopper's currency picker.
 *
 * Renders nothing when only one currency is enabled — a control with a single
 * option is a control that teaches a shopper it does nothing.
 *
 * Hand-rolled rather than a `<select>`: the list needs a tick against the
 * current choice and the currency's full name alongside its code, and a native
 * select gives neither. The menu is a plain absolute panel, not a portal —
 * unlike the admin's row menus this sits in the header, which has no
 * overflow-clipped ancestor to escape.
 */
export function CurrencySwitcher({
  className,
  tone = "default",
}: {
  className?: string;
  /** `inverse` is used on the dark announcement bar. */
  tone?: "default" | "inverse";
}) {
  const { currency, config, setCurrency, switching } = useCurrency();
  const [open, setOpen] = React.useState(false);

  const panelRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (config.enabled.length < 2) return null;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Currency: ${currency}. Change currency.`}
        disabled={switching}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-light tracking-wide transition-colors duration-300",
          "outline-none focus-visible:underline focus-visible:underline-offset-4",
          switching && "opacity-60",
          tone === "inverse"
            ? "text-porcelain/70 hover:text-porcelain"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <span className="tabular-nums">{currency}</span>
        <ChevronDown
          className={cn(
            "size-3 transition-transform duration-300",
            open && "rotate-180"
          )}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="listbox"
          aria-label="Currency"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-52 border border-hairline bg-background py-1 shadow-xl shadow-obsidian/10"
        >
          {config.enabled.map((code) => {
            const active = code === currency;

            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setCurrency(code);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors duration-200",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-hairline/40 hover:text-foreground"
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-light">
                    {CURRENCY_LABEL[code] ?? code}
                  </span>
                  <span className="block text-xs font-light tabular-nums text-muted-foreground">
                    {code}
                  </span>
                </span>

                {active && (
                  <Check className="size-3.5 shrink-0 text-champagne-dark" strokeWidth={1.8} />
                )}
              </button>
            );
          })}

          {/* Said once, here, rather than beside every price. Converted prices
              are indicative — the charge is computed from the base currency at
              checkout, which is the number that reaches a card statement. */}
          <p className="mt-1 border-t border-hairline px-4 py-2.5 text-[0.6875rem] font-light leading-relaxed text-muted-foreground">
            Prices in other currencies are indicative. You are charged in{" "}
            <span className="tabular-nums">{config.base}</span>.
          </p>
        </div>
      )}
    </div>
  );
}
