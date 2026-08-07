/**
 * Seeds Supabase from the local catalogue.
 *
 *   npm run seed          # data only
 *   npm run seed -- --media   # also upload public/media to Storage
 *
 * Idempotent: every write is an upsert keyed on a natural key (slug, code,
 * sku), so running it twice changes nothing. That matters because a seed you
 * are afraid to re-run is a seed you stop using.
 *
 * Uses the service-role key and therefore bypasses RLS. It never runs in the
 * app — only from a terminal, by someone who already has the key.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  CATEGORIES,
  COLLECTIONS,
  COUNTRIES,
  JOURNAL,
  PRODUCTS,
} from "@/data/catalog";
import { PROMOTIONS } from "@/data/commerce";
import { HELP_PAGES, LEGAL_PAGES } from "@/data/content";
import type { Database } from "@/lib/supabase/types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY.\n" +
      "Copy .env.example to .env.local and fill it in."
  );
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const uploadMedia = process.argv.includes("--media");
const PUBLIC_DIR = join(process.cwd(), "public");

/** Local `/media/...` path → Storage object key. */
function toStoragePath(url: string): string {
  return url.replace(/^\/media\//, "");
}

function step(label: string) {
  process.stdout.write(`  ${label.padEnd(42, ".")} `);
}

function ok(detail: string | number) {
  console.log(`ok (${detail})`);
}

// PromiseLike, not Promise: postgrest query builders are thenable but are not
// actual Promises, so they lack `catch`/`finally`.
async function must(
  label: string,
  run: () => PromiseLike<{ error: unknown }>
): Promise<void> {
  step(label);
  const { error } = await run();
  if (error) {
    console.log("FAILED");
    console.error(error);
    process.exit(1);
  }
  ok("done");
}

/* ------------------------------------------------------------- reference */

async function seedCountries() {
  step("countries");
  const rows = COUNTRIES.map((c, index) => ({
    code: c.code,
    name: c.name,
    flag_emoji: c.flag,
    lead_time_min_days: c.leadTimeMinDays,
    lead_time_max_days: c.leadTimeMaxDays,
    is_active: true,
    position: index,
  }));

  const { error } = await supabase
    .from("countries")
    .upsert(rows, { onConflict: "code" });
  if (error) throw error;
  ok(rows.length);
}

async function seedCategories() {
  step("categories");
  const rows = CATEGORIES.map((c, index) => ({
    slug: c.slug,
    name: c.name,
    group: c.group,
    description: c.description,
    position: index,
    is_active: true,
  }));

  const { error } = await supabase
    .from("categories")
    .upsert(rows, { onConflict: "slug" });
  if (error) throw error;
  ok(rows.length);
}

async function seedCollections() {
  step("collections");
  const rows = COLLECTIONS.map((c) => ({
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    description: c.description,
    image_url: toStoragePath(c.image.url),
    image_alt: c.image.alt,
    image_width: c.image.width,
    image_height: c.image.height,
    position: c.position,
    is_featured: c.isFeatured,
    is_active: true,
  }));

  const { error } = await supabase
    .from("collections")
    .upsert(rows, { onConflict: "slug" });
  if (error) throw error;
  ok(rows.length);
}

async function seedArticles() {
  step("journal articles");
  const rows = JOURNAL.map((a) => ({
    slug: a.slug,
    title: a.title,
    kicker: a.kicker,
    excerpt: a.excerpt,
    body: a.body,
    image_url: toStoragePath(a.image.url),
    image_alt: a.image.alt,
    image_width: a.image.width,
    image_height: a.image.height,
    reading_minutes: a.readingMinutes,
    author: a.author,
    is_published: true,
    published_at: a.publishedAt,
  }));

  const { error } = await supabase
    .from("articles")
    .upsert(rows, { onConflict: "slug" });
  if (error) throw error;
  ok(rows.length);
}

/**
 * Help and legal copy.
 *
 * These pages lived only in `src/data/content.ts` and were rendered straight
 * from the bundle; `content_pages` existed in the schema and had never held a
 * row. Seeding them is what lets the Pages module edit the copy the storefront
 * actually serves — `src/lib/content.ts` reads the table and falls back to the
 * same constants, so this is a promotion of the fallback into real data rather
 * than a second source of truth.
 */
async function seedContentPages() {
  step("content pages");

  const rows = [
    ...HELP_PAGES.map((page, index) => ({ page, section: "help", index })),
    ...LEGAL_PAGES.map((page, index) => ({ page, section: "legal", index })),
  ].map(({ page, section, index }) => ({
    slug: page.slug,
    section,
    title: page.title,
    eyebrow: page.eyebrow,
    subtitle: page.summary,
    // `sections` is already the stored shape; `facts` is optional on both
    // sides, so it round-trips without a transform.
    body: page.sections,
    seo_title: null,
    seo_description: page.summary,
    position: index,
    is_published: true,
  }));

  const { error } = await supabase
    .from("content_pages")
    .upsert(rows, { onConflict: "slug" });
  if (error) throw error;
  ok(rows.length);
}

async function seedPromotions() {
  step("promotions");
  const rows = PROMOTIONS.map((p) => ({
    code: p.code,
    label: p.label,
    kind: p.kind,
    value: p.value,
    minimum_subtotal: p.minimumSubtotal,
    is_active: true,
  }));

  const { error } = await supabase
    .from("promotions")
    .upsert(rows, { onConflict: "code" });
  if (error) throw error;
  ok(rows.length);
}

/* -------------------------------------------------------------- products */

async function seedProducts() {
  step("resolving category + collection ids");
  const [{ data: categories }, { data: collections }] = await Promise.all([
    supabase.from("categories").select("id, slug"),
    supabase.from("collections").select("id, slug"),
  ]);

  const categoryId = new Map((categories ?? []).map((c) => [c.slug, c.id]));
  const collectionId = new Map((collections ?? []).map((c) => [c.slug, c.id]));
  ok(`${categoryId.size} + ${collectionId.size}`);

  step(`products (${PRODUCTS.length})`);
  const productRows = PRODUCTS.map((p) => ({
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    excerpt: p.excerpt,
    description: p.description,
    story: p.story,
    details: p.details,
    care: p.care,
    composition: p.composition,
    origin_label: p.origin,
    origin_country_code: p.originCountry || null,
    origin_city: p.originCity,
    category_id: categoryId.get(p.categorySlug) ?? null,
    price: p.price,
    compare_at_price: p.compareAtPrice,
    currency: p.currency,
    rating: p.rating,
    review_count: p.reviewCount,
    flags: p.flags,
    is_featured: p.isFeatured,
    // `available` is maintained by a trigger off variant stock; seeding it
    // here would only be overwritten a moment later.
    is_active: true,
    published_at: p.publishedAt,
  }));

  const { data: inserted, error } = await supabase
    .from("products")
    .upsert(productRows, { onConflict: "slug" })
    .select("id, slug");

  if (error) throw error;
  const productId = new Map((inserted ?? []).map((p) => [p.slug, p.id]));
  ok(productId.size);

  // Children are replaced wholesale per product rather than diffed. Simpler,
  // and correct: the local catalogue is the source of truth for a seed.
  step("clearing existing product children");
  const ids = [...productId.values()];
  for (const table of [
    "product_images",
    "product_options",
    "product_variants",
    "product_collections",
  ] as const) {
    const { error: delError } = await supabase
      .from(table)
      .delete()
      .in("product_id", ids);
    if (delError) throw delError;
  }
  ok("4 tables");

  step("product ↔ collection links");
  const links = PRODUCTS.flatMap((p) =>
    p.collectionSlugs.flatMap((slug) => {
      const cid = collectionId.get(slug);
      const pid = productId.get(p.slug);
      return cid && pid
        ? [{ product_id: pid, collection_id: cid, position: 0 }]
        : [];
    })
  );
  const { error: linkError } = await supabase
    .from("product_collections")
    .upsert(links, { onConflict: "product_id,collection_id" });
  if (linkError) throw linkError;
  ok(links.length);

  step("images");
  // Local image ids are remapped to the database ids so variants can point at
  // the right image after insert.
  const imageRows = PRODUCTS.flatMap((p) =>
    p.images.map((img) => ({
      product_id: productId.get(p.slug)!,
      storage_path: toStoragePath(img.url),
      alt: img.alt,
      width: img.width,
      height: img.height,
      position: img.position,
      _localId: img.id,
    }))
  );

  const { data: insertedImages, error: imageError } = await supabase
    .from("product_images")
    .insert(imageRows.map(({ _localId, ...row }) => row))
    .select("id, product_id, position");
  if (imageError) throw imageError;

  const imageIdByKey = new Map(
    (insertedImages ?? []).map((img) => [`${img.product_id}:${img.position}`, img.id])
  );
  ok(imageRows.length);

  step("options + values");
  let valueCount = 0;
  for (const product of PRODUCTS) {
    const pid = productId.get(product.slug)!;
    if (!product.options.length) continue;

    const { data: options, error: optionError } = await supabase
      .from("product_options")
      .insert(
        product.options.map((o, index) => ({
          product_id: pid,
          name: o.name,
          type: o.type,
          position: index,
        }))
      )
      .select("id, name");
    if (optionError) throw optionError;

    const optionIdByName = new Map((options ?? []).map((o) => [o.name, o.id]));

    const valueRows = product.options.flatMap((o) =>
      o.values.map((v, index) => ({
        option_id: optionIdByName.get(o.name)!,
        value: v.value,
        label: v.label,
        hex: v.hex ?? null,
        available: v.available,
        position: index,
      }))
    );

    const { error: valueError } = await supabase
      .from("product_option_values")
      .insert(valueRows);
    if (valueError) throw valueError;
    valueCount += valueRows.length;
  }
  ok(valueCount);

  step("variants");
  const variantRows = PRODUCTS.flatMap((p) => {
    const pid = productId.get(p.slug)!;
    return p.variants.map((v) => {
      // Map the seed's image reference onto the row we just inserted.
      const localIndex = p.images.findIndex((img) => img.id === v.imageId);
      const imageId =
        localIndex >= 0
          ? (imageIdByKey.get(`${pid}:${p.images[localIndex].position}`) ?? null)
          : null;

      return {
        product_id: pid,
        sku: v.sku,
        title: v.title,
        selected_options: v.selectedOptions,
        price: v.price,
        compare_at_price: v.compareAtPrice,
        inventory_quantity: v.inventoryQuantity,
        image_id: imageId,
      };
    });
  });

  const { error: variantError } = await supabase
    .from("product_variants")
    .upsert(variantRows, { onConflict: "sku" });
  if (variantError) throw variantError;
  ok(variantRows.length);
}

/* ---------------------------------------------------------------- media */

async function seedStorage() {
  const manifestPath = join(PUBLIC_DIR, "media", "manifest.json");

  let paths: string[];
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

    // The manifest is `{ generatedAt, files }`. Taking Object.values().flat()
    // swept `generatedAt` in beside the paths — it is a string too — and the
    // run then tried to upload a file named after a timestamp. Read the `files`
    // key when it is there, and only fall back to flattening for the older
    // shape.
    paths = Array.isArray(manifest)
      ? manifest
      : Array.isArray(manifest?.files)
        ? manifest.files
        : Object.values(manifest).flat();

    paths = paths.filter((v): v is string => typeof v === "string");
  } catch {
    console.log("  media manifest unreadable — skipping upload");
    return;
  }

  const files = [...new Set(paths.map(toStoragePath))].filter(Boolean);
  console.log(`  uploading ${files.length} objects to the "media" bucket`);

  let done = 0;
  let failed = 0;

  // Small concurrency pool. Serial would take minutes for ~130 images;
  // unbounded parallelism gets throttled and fails opaquely.
  const queue = [...files];
  const workers = Array.from({ length: 6 }, async () => {
    for (;;) {
      const path = queue.pop();
      if (!path) return;

      try {
        const body = await readFile(join(PUBLIC_DIR, "media", path));
        const { error } = await supabase.storage
          .from("media")
          .upload(path, body, {
            contentType: path.endsWith(".png") ? "image/png" : "image/jpeg",
            upsert: true,
            cacheControl: "31536000",
          });
        if (error) throw error;
        done += 1;
        if (done % 20 === 0) console.log(`    ${done}/${files.length}`);
      } catch (error) {
        failed += 1;
        console.error(`    failed: ${path}`, (error as Error).message);
      }
    }
  });

  await Promise.all(workers);
  console.log(`  media upload: ${done} ok, ${failed} failed`);
}

/* ----------------------------------------------------------------- main */

async function main() {
  console.log("\nSeeding ZYLO Express → Supabase\n");
  console.log(`  project: ${new URL(SUPABASE_URL!).hostname}\n`);

  await seedCountries();
  await seedCategories();
  await seedCollections();
  await seedArticles();
  await seedContentPages();
  await seedPromotions();
  await seedProducts();

  await must("site settings", () =>
    supabase.from("site_settings").upsert(
      [
        {
          key: "free_shipping_threshold",
          value: 50000,
          description: "Minor units. Orders above this ship free on standard.",
        },
        {
          key: "tax_rate",
          value: 0.0825,
          description: "Flat rate until a tax engine is wired in.",
        },
        {
          key: "announcement",
          value: {
            text: "Complimentary insured delivery on orders over $500",
            href: "/help/shipping",
          },
          description: "Legacy single-message form. Superseded by `announcements`.",
        },
        {
          // What the bar actually reads — it rotates, so it needs a list.
          key: "announcements",
          value: [
            "Complimentary insured delivery on orders over $500",
            "Private appointments in Paris, London, New York and Tokyo",
          ],
          description: "Rotating messages in the bar above the header.",
        },
      ],
      { onConflict: "key" }
    )
  );

  if (uploadMedia) {
    console.log("\n  media\n");
    await seedStorage();
  } else {
    console.log("\n  (skipping media — pass --media to upload to Storage)");
  }

  console.log("\nDone.\n");
}

main().catch((error) => {
  console.error("\nSeed failed:\n", error);
  process.exit(1);
});
