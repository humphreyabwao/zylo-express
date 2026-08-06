import "server-only";

import type { Currency } from "@/lib/types";

/**
 * Presentment currency conversion.
 *
 * The catalogue is priced in USD minor units. Paystack can only charge the
 * currency its account is registered for — a Kenyan account, which is the only
 * kind that offers M-Pesa, settles KES. So an order total has to be converted
 * before it is handed to the provider.
 *
 * Two amounts therefore exist for every payment and both are stored:
 *
 *   amount / currency               what the store charged, USD minor units
 *   charge_amount / charge_currency what the provider actually moved
 *
 * plus the rate used. Storing only one loses information: recomputing the
 * other later with a rate that has since moved silently rewrites history, and
 * a refund six weeks after the sale then disagrees with the original charge.
 *
 * Every conversion rounds once, at the end, and rounds up. A half-cent lost on
 * every order is a shortfall the merchant absorbs; a half-cent gained is not
 * worth the reconciliation noise either way, so ceil keeps the collected
 * amount at or just above the booked one.
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
  // Kept explicit rather than defaulted: a zero-decimal currency handed the
  // usual ×100 would charge a customer one hundred times the total.
  JPY: 0,
};

/**
 * Indicative USD rates, used when the matching `FX_USD_*` variable is unset.
 *
 * These are stale the moment they are written and exist so a fresh clone can
 * run a sandbox checkout end to end. Set the environment variables from a real
 * FX feed before taking live payments — and widen them to cover settlement
 * risk, since the rate at capture is not the rate at payout.
 */
const FALLBACK_USD_RATES: Record<string, number> = {
  KES: 129,
  NGN: 1500,
  GHS: 15,
  ZAR: 18,
};

export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2;
}

/** Minor units → the decimal string providers expect ("1234" → "12.34"). */
export function toDecimalString(amount: number, currency: string): string {
  const exponent = minorUnitExponent(currency);
  if (exponent === 0) return String(Math.round(amount));

  const divisor = 10 ** exponent;
  return (amount / divisor).toFixed(exponent);
}

/** The inverse, for reading amounts back off a provider payload. */
export function fromDecimalString(value: string, currency: string): number {
  const exponent = minorUnitExponent(currency);
  return Math.round(Number(value) * 10 ** exponent);
}

function usdRate(target: string): number {
  const fromEnv = process.env[`FX_USD_${target}`];
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    console.warn(`[payments] FX_USD_${target} is not a positive number; ignoring.`);
  }

  const fallback = FALLBACK_USD_RATES[target];
  if (!fallback) {
    throw new Error(
      `No exchange rate available for USD → ${target}. Set FX_USD_${target}.`
    );
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      `[payments] Charging in ${target} using a hardcoded fallback rate. ` +
        `Set FX_USD_${target} from a live FX source.`
    );
  }

  return fallback;
}

export interface ConvertedAmount {
  /** Minor units of `currency`. */
  amount: number;
  currency: string;
  /** charge_amount / source amount, recorded on the payment row. */
  rate: number;
}

/**
 * Convert a store total into the currency a provider will charge.
 *
 * Same-currency conversion is not a special case bolted on — it is the common
 * path for PayPal, which charges USD directly, and must return rate 1 exactly
 * so nothing downstream re-derives a total off a rounded rate.
 */
export function convertForCharge(
  amount: number,
  from: Currency,
  to: string
): ConvertedAmount {
  const target = to.toUpperCase();
  if (target === from) return { amount, currency: target, rate: 1 };

  if (from !== "USD") {
    // Rates are quoted against USD only. Nothing in the catalogue is priced
    // in anything else today, so a cross rate would be untested code guarding
    // a case that cannot happen — fail loudly if that ever changes.
    throw new Error(`Unsupported source currency for conversion: ${from}`);
  }

  const rate = usdRate(target);

  // Convert in major units so differing minor-unit exponents (USD cents →
  // a zero-decimal currency) land on the right scale.
  const sourceExponent = minorUnitExponent(from);
  const targetExponent = minorUnitExponent(target);
  const major = amount / 10 ** sourceExponent;
  const converted = Math.ceil(major * rate * 10 ** targetExponent);

  return { amount: converted, currency: target, rate };
}
