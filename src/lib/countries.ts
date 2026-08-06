import type { Country } from "@/lib/types";

/**
 * Sourcing-origin registry.
 *
 * Client-safe on purpose: product cards render a flag and country name, and
 * ISO names and flags are stable reference data, so shipping ~15 rows to the
 * browser is cheaper than a lookup per card and can't go meaningfully stale.
 *
 * Postgres remains the source of truth for *which* origins exist and for lead
 * times shown in filters — see `getCountries()`. This is the display fallback,
 * and the seed the `countries` table is populated from.
 *
 * Lead times are the handling window at origin — how long before the parcel
 * leaves the country — not total delivery. Checkout adds transit on top.
 */
export const COUNTRIES: Country[] = [
  { code: "CN", name: "China", flag: "🇨🇳", leadTimeMinDays: 7, leadTimeMaxDays: 18 },
  { code: "VN", name: "Vietnam", flag: "🇻🇳", leadTimeMinDays: 9, leadTimeMaxDays: 20 },
  { code: "IN", name: "India", flag: "🇮🇳", leadTimeMinDays: 10, leadTimeMaxDays: 22 },
  { code: "KR", name: "South Korea", flag: "🇰🇷", leadTimeMinDays: 6, leadTimeMaxDays: 14 },
  { code: "TR", name: "Türkiye", flag: "🇹🇷", leadTimeMinDays: 8, leadTimeMaxDays: 16 },
  { code: "TH", name: "Thailand", flag: "🇹🇭", leadTimeMinDays: 9, leadTimeMaxDays: 19 },
  { code: "IT", name: "Italy", flag: "🇮🇹", leadTimeMinDays: 4, leadTimeMaxDays: 10 },
  { code: "FR", name: "France", flag: "🇫🇷", leadTimeMinDays: 4, leadTimeMaxDays: 10 },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", leadTimeMinDays: 3, leadTimeMaxDays: 8 },
  { code: "CH", name: "Switzerland", flag: "🇨🇭", leadTimeMinDays: 5, leadTimeMaxDays: 12 },
  { code: "DE", name: "Germany", flag: "🇩🇪", leadTimeMinDays: 4, leadTimeMaxDays: 10 },
  { code: "JP", name: "Japan", flag: "🇯🇵", leadTimeMinDays: 6, leadTimeMaxDays: 14 },
  { code: "DK", name: "Denmark", flag: "🇩🇰", leadTimeMinDays: 4, leadTimeMaxDays: 10 },
  { code: "BE", name: "Belgium", flag: "🇧🇪", leadTimeMinDays: 4, leadTimeMaxDays: 9 },
  { code: "CZ", name: "Czech Republic", flag: "🇨🇿", leadTimeMinDays: 5, leadTimeMaxDays: 12 },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string): Country | undefined {
  return BY_CODE.get(code);
}

/**
 * Maps the country named at the end of an origin label to its ISO code, so a
 * product only ever states its origin once: "Made in Florence, Italy" → IT.
 */
export const COUNTRY_BY_NAME: Record<string, string> = {
  China: "CN",
  Vietnam: "VN",
  India: "IN",
  "South Korea": "KR",
  Türkiye: "TR",
  Thailand: "TH",
  Italy: "IT",
  France: "FR",
  England: "GB",
  Scotland: "GB",
  "United Kingdom": "GB",
  Switzerland: "CH",
  Germany: "DE",
  Japan: "JP",
  Denmark: "DK",
  Belgium: "BE",
  "Czech Republic": "CZ",
};
