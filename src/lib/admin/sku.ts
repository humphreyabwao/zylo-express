import "server-only";

import { randomBytes } from "node:crypto";

import type { TypedClient } from "@/lib/supabase/server";

/**
 * SKU generation.
 *
 * The catalogue's existing convention, read off the seeded data:
 *
 *   ZY-ALPAI6-0203
 *   ── ──────  ────
 *   │  │       └─ GGVV: option group, then variant within that group
 *   │  └───────── six-character stem derived from the product name
 *   └──────────── house prefix
 *
 * Generated SKUs follow it rather than inventing a second scheme, so a hand-
 * written SKU and an auto-generated one sort together in a warehouse list and
 * mean the same thing to whoever is reading a picking slip.
 *
 * ## Uniqueness
 *
 * `product_variants.sku` is globally unique, and this checks the database
 * before proposing a value — but a check-then-insert is not atomic, so the
 * unique index remains the real guard. Callers insert inside a retry loop and
 * regenerate on 23505. Two operators creating products in the same second is
 * rare; silently assigning one of them a duplicate is not acceptable when it
 * happens.
 */

const PREFIX = "ZY";
const STEM_LENGTH = 6;

/** Base32-ish, without the glyphs that get misread on a printed label. */
const UNAMBIGUOUS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * Six characters of stem from a product name.
 *
 * Accents are folded rather than dropped — "Théâtre" becomes THEATR, not
 * THTR — and anything too short to be recognisable is padded with unambiguous
 * random characters instead of filler, so two unnamed products do not collide
 * on the same stem.
 */
export function skuStem(name: string): string {
  const folded = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (folded.length >= STEM_LENGTH) return folded.slice(0, STEM_LENGTH);

  const bytes = randomBytes(STEM_LENGTH);
  let padded = folded;
  for (let i = 0; padded.length < STEM_LENGTH; i++) {
    padded += UNAMBIGUOUS[bytes[i]! % UNAMBIGUOUS.length];
  }
  return padded;
}

function format(stem: string, group: number, index: number): string {
  const suffix = `${String(group).padStart(2, "0")}${String(index).padStart(2, "0")}`;
  return `${PREFIX}-${stem}-${suffix}`;
}

/**
 * The next free SKU for a product name.
 *
 * Walks the suffixes already in use for this stem and continues the sequence:
 * the next variant within the highest existing group, rolling into a new group
 * when that one is full. A brand-new stem starts at 0101.
 *
 * Stems are shared rather than owned — two differently-named products can fold
 * to the same six characters — which is fine, because the search below spans
 * every SKU with that stem. The sequence is per-stem, not per-product.
 */
export async function nextSku(
  supabase: TypedClient,
  productName: string,
  options: { stem?: string } = {}
): Promise<string> {
  const stem = options.stem ?? skuStem(productName);

  const { data, error } = await supabase
    .from("product_variants")
    .select("sku")
    .like("sku", `${PREFIX}-${stem}-%`);

  if (error) {
    console.error("[admin] sku lookup failed:", error);
    // A random suffix is not the house pattern, but it is unique enough to
    // insert and be corrected by hand — better than blocking the create.
    return format(stem, 99, Math.floor(Math.random() * 99) + 1);
  }

  const used = new Map<number, Set<number>>();
  for (const row of data ?? []) {
    const match = /-(\d{2})(\d{2})$/.exec(row.sku);
    if (!match) continue;

    const group = Number(match[1]);
    const index = Number(match[2]);
    if (!used.has(group)) used.set(group, new Set());
    used.get(group)!.add(index);
  }

  if (used.size === 0) return format(stem, 1, 1);

  const highestGroup = Math.max(...used.keys());
  const indices = used.get(highestGroup)!;

  for (let index = 1; index <= 99; index++) {
    if (!indices.has(index)) return format(stem, highestGroup, index);
  }

  // That group is full — 99 variants of one option is well past where a
  // catalogue needs help, but rolling over beats returning a duplicate.
  return format(stem, highestGroup + 1, 1);
}
