"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  CURRENCY_COOKIE,
  convertAmount,
  formatCurrency,
  type CurrencyConfig,
} from "@/lib/currency";
import { useRealtime } from "@/hooks/use-realtime";

/**
 * The shopper's display currency, and the rates to reach it.
 *
 * Seeded from the server in the root layout, so the first paint is already in
 * the right currency — resolving it on the client would mean every price on
 * the page flashing from USD to KES after hydration.
 *
 * ## Why a context rather than threading a prop
 *
 * Prices are rendered from about fifty places, and roughly half of them sit
 * inside the cart and checkout, which are Client Components fed by a Zustand
 * store rather than by props from a page. There is no prop path from the
 * server to those components; a context is the path.
 *
 * ## What deliberately does not use this
 *
 * Order history and the admin portal. Both render money that has already been
 * recorded, and converting a past order at today's rate would show a customer
 * a number nobody ever charged them — one that changes every time they look.
 * Those call `formatPrice` with the base currency and always will.
 */

interface CurrencyContextValue {
  /** The currency being displayed. */
  currency: string;
  config: CurrencyConfig;
  /** Base minor units → a formatted string in the display currency. */
  format: (baseMinor: number, options?: { showDecimals?: boolean }) => string;
  /** Base minor units → display minor units, unformatted. */
  convert: (baseMinor: number) => number;
  /** Switch, persist, and re-render the server tree. */
  setCurrency: (next: string) => void;
  /** True while a switch is in flight. */
  switching: boolean;
  /**
   * Base minor units, from `site_settings`.
   *
   * Carried here because the cart's free-shipping meter is a Client Component
   * fed by a Zustand store, with no prop path from the server. The meter is a
   * preview — the charged figure is computed in `src/lib/orders.ts`, which
   * reads settings directly.
   */
  freeShippingThreshold: number;
}

const CurrencyContext = React.createContext<CurrencyContextValue | null>(null);

/** A year: a currency preference is not a session detail. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function CurrencyProvider({
  initialCurrency,
  config,
  freeShippingThreshold,
  children,
}: {
  initialCurrency: string;
  config: CurrencyConfig;
  freeShippingThreshold: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [switching, startTransition] = React.useTransition();

  /**
   * The displayed currency is the server's answer, held in no local state.
   *
   * The obvious alternative — optimistic local state, updated on click and
   * reconciled when the server catches up — is worse here, not just more
   * code. Only prices rendered *through this context* would move immediately;
   * every price a Server Component formatted would keep its old currency until
   * the refresh landed. The page would show two currencies at once for a
   * few hundred milliseconds, which is a far more alarming thing for a shopper
   * to catch than a brief pending state.
   *
   * So `setCurrency` writes the cookie, asks the server to re-render, and
   * `switching` covers the gap. Everything changes together or not at all.
   *
   * It also means an admin changing the store default — or removing a currency
   * from the switcher — reaches an open tab for free: the server re-resolves
   * and this prop simply arrives different.
   */
  const currency = initialCurrency;

  /**
   * A settings write re-renders every open storefront tab.
   *
   * This is the "changes on the storefront when I change it in admin" part.
   * `router.refresh()` re-runs the server render, which re-reads the settings
   * — whose cache tag the admin action has just dropped — and hands back a new
   * `initialCurrency` and `config` through the effect above.
   */
  useRealtime("settings", () => {
    startTransition(() => router.refresh());
  });

  const setCurrency = React.useCallback(
    (next: string) => {
      const code = next.toUpperCase();
      if (!config.enabled.includes(code)) return;

      // `SameSite=Lax` so the choice survives a link from an email or a search
      // result. Not `Secure`, because local development is plain HTTP and a
      // cookie that never sets there is a preference that never works there.
      document.cookie = `${CURRENCY_COOKIE}=${code}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;

      // Server Components hold the formatted prices for anything not rendered
      // through this context, so the tree has to be re-rendered rather than
      // only re-styled.
      startTransition(() => router.refresh());
    },
    [config.enabled, router]
  );

  const value = React.useMemo<CurrencyContextValue>(
    () => ({
      currency,
      config,
      convert: (baseMinor: number) => convertAmount(baseMinor, currency, config),
      format: (baseMinor: number, options) =>
        formatCurrency(convertAmount(baseMinor, currency, config), currency, options),
      setCurrency,
      switching,
      freeShippingThreshold,
    }),
    [currency, config, setCurrency, switching, freeShippingThreshold]
  );

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  );
}

/**
 * Read the display currency.
 *
 * Throws outside a provider rather than defaulting to USD. A price silently
 * rendering in the wrong currency is the exact failure this whole module
 * exists to prevent, and it would be invisible in review — a thrown error at
 * the first render is not.
 */
export function useCurrency(): CurrencyContextValue {
  const context = React.useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used inside <CurrencyProvider>.");
  }
  return context;
}
