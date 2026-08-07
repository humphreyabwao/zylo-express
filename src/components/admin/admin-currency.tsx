"use client";

import * as React from "react";

import {
  convertAmount,
  formatCurrency,
  type CurrencyConfig,
} from "@/lib/currency";

/**
 * Money in the portal, in the currency the store is configured for.
 *
 * The portal used to render the base currency everywhere, on the argument that
 * a ledger should be read in its own units. In practice that meant a shop
 * trading in KES had a dashboard quoting dollars, and every figure needed
 * translating in the operator's head before it meant anything.
 *
 * So the portal now follows `currency.default` from settings. Amounts are still
 * *stored* in base minor units — nothing about the ledger changes — this is a
 * display layer, exactly as it is on the storefront.
 *
 * ## What this does not fix, and cannot
 *
 * Historical rows are converted at **today's** rate, not the rate on the day.
 * An order placed when the shilling was at 120 shows at 129 now. For a store
 * whose books are USD that is a presentation choice, not a mistake — the
 * amount charged is unchanged and `payments` still records the exact rate used
 * at capture. But a figure here is an indication, not an audit trail, and the
 * exports are the thing to reconcile from.
 *
 * There is no switcher: this is the store's currency, not the operator's.
 */

interface AdminCurrencyValue {
  /** The currency the portal renders in. */
  currency: string;
  config: CurrencyConfig;
  /** Base minor units → a formatted string. */
  format: (baseMinor: number) => string;
  /** True when the display currency differs from the ledger's. */
  converted: boolean;
}

const AdminCurrencyContext = React.createContext<AdminCurrencyValue | null>(null);

export function AdminCurrencyProvider({
  config,
  children,
}: {
  config: CurrencyConfig;
  children: React.ReactNode;
}) {
  const value = React.useMemo<AdminCurrencyValue>(() => {
    const currency = config.default || config.base;

    return {
      currency,
      config,
      format: (baseMinor: number) =>
        formatCurrency(convertAmount(baseMinor, currency, config), currency),
      converted: currency !== config.base,
    };
  }, [config]);

  return (
    <AdminCurrencyContext.Provider value={value}>
      {children}
    </AdminCurrencyContext.Provider>
  );
}

export function useAdminCurrency(): AdminCurrencyValue {
  const context = React.useContext(AdminCurrencyContext);
  if (!context) {
    throw new Error(
      "useAdminCurrency must be used inside <AdminCurrencyProvider>."
    );
  }
  return context;
}

/**
 * A money figure.
 *
 * A component rather than a helper function because the currency lives in
 * context, and half the portal's money is rendered from Server Components that
 * have no way to read one. This is a leaf, so importing it turns only the span
 * into client code.
 */
export function Money({
  amount,
  className,
}: {
  /** Base-currency minor units, as stored. */
  amount: number;
  className?: string;
}) {
  const { format } = useAdminCurrency();
  return <span className={className}>{format(amount)}</span>;
}
