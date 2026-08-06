import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { resolveSiteUrl } from "./site-url";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Prices live in minor units (cents) everywhere to avoid float drift. */
export function formatPrice(
  amountInCents: number,
  options: { currency?: string; locale?: string; showDecimals?: boolean } = {}
) {
  const {
    currency = "USD",
    locale = "en-US",
    showDecimals = amountInCents % 100 !== 0,
  } = options;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(amountInCents / 100);
}

export function formatDate(
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {}
) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...options,
  }).format(typeof date === "string" ? new Date(date) : date);
}

const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Deterministic percentage off, rounded the way merchandisers expect. */
export function discountPercent(compareAt: number, price: number) {
  if (compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : plural ?? `${singular}s`;
}

/**
 * Every caller is server-side — `sitemap.ts`, `robots.ts`, `metadata` exports
 * and JSON-LD — so the unprefixed environment variables `resolveSiteUrl` reads
 * are available. See `site-url.ts` for why this no longer reads
 * `NEXT_PUBLIC_SITE_URL` directly.
 */
export function absoluteUrl(path = "") {
  const base = resolveSiteUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Small helper so range inputs and quantity steppers stay in bounds. */
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
