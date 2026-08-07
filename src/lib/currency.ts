/**
 * Display-currency conversion.
 *
 * Deliberately dependency-free and free of `server-only`: the cart, the
 * checkout and every price on a product card are Client Components, and they
 * all need this. Nothing here touches the database.
 *
 * ## The rule this file exists to keep
 *
 * **Live prices convert. Recorded money does not.**
 *
 * A product's price is a current claim about what something costs, so showing
 * it in the shopper's currency is just presentation. An order total, a payment
 * amount or a refund is a record of money that has already moved — converting
 * one at today's rate would show a customer a number nobody ever charged them,
 * and it would change every time they looked. So order history and the admin
 * portal render the base currency, always.
 *
 * ## Rounding
 *
 * Converted prices round half-up to the currency's minor unit, then, for
 * currencies whose unit is coarse enough that trailing decimals are noise
 * (KES, JPY, NGN…), to a whole major unit. A price tag reading "KES 161,247"
 * is arithmetically honest and looks like a bug; every shop in Nairobi would
 * write 161,250.
 *
 * This is display rounding only. It never feeds a total that gets charged —
 * the charge is computed from the USD books by `src/lib/payments/currency.ts`,
 * which rounds once, up, at the end.
 */

/** Decimal places in each currency's minor unit. */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  KES: 2,
  NGN: 2,
  GHS: 2,
  ZAR: 2,
  AED: 2,
  CAD: 2,
  AUD: 2,
  CHF: 2,
  // Explicit rather than defaulted: a zero-decimal currency handed the usual
  // ×100 would display one hundred times the price.
  JPY: 0,
};

/**
 * Currencies displayed without decimals, and rounded to a whole unit.
 *
 * Chosen by what the minor unit is actually worth. A KES cent is ~$0.00008 —
 * nobody prices in them, and showing two decimals on a five-figure number is
 * visual noise that reads as a rounding error.
 */
const WHOLE_UNIT_DISPLAY = new Set(["KES", "JPY", "NGN", "UGX", "TZS", "RWF"]);

/** Locale used to format each currency, so grouping and symbol placement fit. */
const CURRENCY_LOCALE: Record<string, string> = {
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  KES: "en-KE",
  NGN: "en-NG",
  GHS: "en-GH",
  ZAR: "en-ZA",
  JPY: "ja-JP",
  AED: "ar-AE",
  CAD: "en-CA",
  AUD: "en-AU",
  CHF: "de-CH",
};

/** Display metadata for the switcher. */
export const CURRENCY_LABEL: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  KES: "Kenyan Shilling",
  NGN: "Nigerian Naira",
  GHS: "Ghanaian Cedi",
  ZAR: "South African Rand",
  JPY: "Japanese Yen",
  AED: "UAE Dirham",
  CAD: "Canadian Dollar",
  AUD: "Australian Dollar",
  CHF: "Swiss Franc",
};

/** Every currency this app knows how to format. The portal offers these. */
export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_LABEL);

export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2;
}

export function currencyLocale(currency: string): string {
  return CURRENCY_LOCALE[currency.toUpperCase()] ?? "en-US";
}

export interface CurrencyConfig {
  /** The ledger currency every stored amount is in. */
  base: string;
  /** What a visitor sees before choosing. */
  default: string;
  /** Offered in the switcher. Always contains `base`. */
  enabled: string[];
  /** Units of each currency per 1 base unit. `base` is always exactly 1. */
  rates: Record<string, number>;
}

/**
 * Convert an amount in base minor units into `target` minor units.
 *
 * Returns the amount unchanged when the target is the base — not as an
 * optimisation, but so that the common path cannot be perturbed by a rate that
 * someone has typed as 0.9999 instead of 1.
 */
export function convertAmount(
  baseMinor: number,
  target: string,
  config: CurrencyConfig
): number {
  const to = target.toUpperCase();
  const base = config.base.toUpperCase();
  if (to === base) return baseMinor;

  const rate = config.rates[to];
  // An enabled currency with no rate is a misconfiguration, and guessing 1
  // would silently sell at a hundredth of the price. Falling back to the base
  // amount is wrong too, but it is wrong *visibly* — and `resolveCurrency`
  // below refuses to select a currency that has no rate, so this is a
  // last-resort guard rather than an expected path.
  if (!Number.isFinite(rate) || rate <= 0) return baseMinor;

  const baseExponent = minorUnitExponent(base);
  const targetExponent = minorUnitExponent(to);

  const major = (baseMinor / 10 ** baseExponent) * rate;

  if (WHOLE_UNIT_DISPLAY.has(to)) {
    return Math.round(major) * 10 ** targetExponent;
  }

  return Math.round(major * 10 ** targetExponent);
}

/** True when the currency is shown without decimal places. */
export function isWholeUnitDisplay(currency: string): boolean {
  return WHOLE_UNIT_DISPLAY.has(currency.toUpperCase());
}

/**
 * Format an amount already expressed in `currency`'s minor units.
 *
 * Separate from `formatBaseAmount` because the cart and the checkout hold
 * converted subtotals and must not convert twice.
 */
export function formatCurrency(
  minor: number,
  currency: string,
  options: { showDecimals?: boolean } = {}
): string {
  const code = currency.toUpperCase();
  const exponent = minorUnitExponent(code);

  const whole = WHOLE_UNIT_DISPLAY.has(code);
  const showDecimals =
    options.showDecimals ?? (whole ? false : minor % 10 ** exponent !== 0);

  return new Intl.NumberFormat(currencyLocale(code), {
    style: "currency",
    currency: code,
    minimumFractionDigits: showDecimals ? exponent : 0,
    maximumFractionDigits: showDecimals ? exponent : 0,
  }).format(minor / 10 ** exponent);
}

/** Convert from the base currency and format, in one step. */
export function formatBaseAmount(
  baseMinor: number,
  target: string,
  config: CurrencyConfig,
  options: { showDecimals?: boolean } = {}
): string {
  return formatCurrency(
    convertAmount(baseMinor, target, config),
    target,
    options
  );
}

/**
 * Decide which currency to render for a request.
 *
 * Order: the shopper's own choice, then the store default, then the base. Each
 * step is checked against `enabled` *and* against having a usable rate — a
 * currency removed from the switcher, or left without a rate, must not keep
 * being served to whoever had already chosen it.
 */
export function resolveCurrency(
  preferred: string | undefined | null,
  config: CurrencyConfig
): string {
  const usable = (code: string | undefined | null): code is string => {
    if (!code) return false;
    const upper = code.toUpperCase();
    if (upper === config.base.toUpperCase()) return true;
    if (!config.enabled.includes(upper)) return false;
    const rate = config.rates[upper];
    return Number.isFinite(rate) && rate > 0;
  };

  if (usable(preferred)) return preferred.toUpperCase();
  if (usable(config.default)) return config.default.toUpperCase();
  return config.base.toUpperCase();
}

/** The cookie the shopper's choice is remembered in. */
export const CURRENCY_COOKIE = "zylo_currency";
