/**
 * Generates the art-directed placeholder imagery the catalogue ships with.
 *
 * These are real JPEGs so `next/image` optimises, resizes and blur-placeholders
 * them exactly as it will for the production photography. When the real assets
 * land in Supabase Storage, only `src/lib/media.ts` needs to change.
 *
 *   node scripts/generate-media.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "media");

/* ------------------------------------------------------------------ palette */

const FIELDS = {
  obsidian: { from: "#16161a", to: "#050506", ink: "#c0a062", light: false },
  graphite: { from: "#3a3a42", to: "#17171b", ink: "#d8bd8a", light: false },
  midnight: { from: "#17294a", to: "#070d1a", ink: "#c0a062", light: false },
  forest: { from: "#264537", to: "#0c1a15", ink: "#c8b184", light: false },
  wine: { from: "#5c1f2b", to: "#230a10", ink: "#dcb98c", light: false },
  champagne: { from: "#cbae74", to: "#8c7233", ink: "#2a2118", light: false },
  linen: { from: "#f2eee6", to: "#ddd3c2", ink: "#3d3830", light: true },
  ivory: { from: "#fbf9f5", to: "#e8e2d6", ink: "#4a453c", light: true },
  bone: { from: "#e8e1d5", to: "#cec3b1", ink: "#3a352d", light: true },
  smoke: { from: "#9b9aa2", to: "#5c5b64", ink: "#f2efe9", light: false },
};

const FIELD_KEYS = Object.keys(FIELDS);

/* ------------------------------------------------------- line-art silhouettes
 * Drawn on a 0..100 square canvas, then scaled into place. Kept deliberately
 * spare — a boutique's icon language rather than an illustration.
 */

const GLYPHS = {
  bag: `
    <path d="M22 38 H78 L74 84 H26 Z" />
    <path d="M38 38 V30 a12 12 0 0 1 24 0 V38" />
    <path d="M22 50 H78" opacity="0.45" />`,
  watch: `
    <circle cx="50" cy="50" r="21" />
    <path d="M39 30 L41 12 H59 L61 30" />
    <path d="M39 70 L41 88 H59 L61 70" />
    <path d="M50 40 V50 L58 55" />`,
  jewellery: `
    <circle cx="50" cy="56" r="20" />
    <circle cx="50" cy="56" r="13" opacity="0.4" />
    <path d="M50 36 L42 22 H58 Z" />`,
  fragrance: `
    <path d="M32 44 H68 V84 a4 4 0 0 1 -4 4 H36 a4 4 0 0 1 -4 -4 Z" />
    <path d="M43 44 V32 H57 V44" />
    <path d="M41 24 H59 V32 H41 Z" />
    <path d="M32 62 H68" opacity="0.4" />`,
  outerwear: `
    <path d="M50 20 L30 28 L24 84 H76 L70 28 Z" />
    <path d="M50 20 L42 34 L50 44 L58 34 Z" />
    <path d="M50 44 V84" opacity="0.4" />`,
  footwear: `
    <path d="M18 66 H50 l12 10 h20 a6 6 0 0 1 6 6 v4 H18 Z" />
    <path d="M18 66 V44 h14 l6 10 h12" />
    <path d="M62 76 H86" opacity="0.4" />`,
  eyewear: `
    <circle cx="28" cy="52" r="15" />
    <circle cx="72" cy="52" r="15" />
    <path d="M43 50 q7 -6 14 0" />
    <path d="M13 46 L4 40" />
    <path d="M87 46 L96 40" />`,
  silk: `
    <path d="M50 14 L86 50 L50 86 L14 50 Z" />
    <path d="M50 30 L70 50 L50 70 L30 50 Z" opacity="0.45" />`,
  home: `
    <path d="M20 46 L50 20 L80 46 V84 H20 Z" />
    <path d="M42 84 V60 H58 V84" opacity="0.5" />`,
  headphones: `
    <path d="M22 58 V48 a28 28 0 0 1 56 0 V58" />
    <path d="M14 62 a8 8 0 0 1 8 -8 h4 v26 h-4 a8 8 0 0 1 -8 -8 Z" />
    <path d="M86 62 a8 8 0 0 0 -8 -8 h-4 v26 h4 a8 8 0 0 0 8 -8 Z" />`,
  speaker: `
    <path d="M28 16 H72 a4 4 0 0 1 4 4 V80 a4 4 0 0 1 -4 4 H28 a4 4 0 0 1 -4 -4 V20 a4 4 0 0 1 4 -4 Z" />
    <circle cx="50" cy="58" r="14" />
    <circle cx="50" cy="32" r="6" opacity="0.5" />`,
  turntable: `
    <path d="M16 26 H84 a3 3 0 0 1 3 3 V76 a3 3 0 0 1 -3 3 H16 a3 3 0 0 1 -3 -3 V29 a3 3 0 0 1 3 -3 Z" />
    <circle cx="44" cy="53" r="19" />
    <circle cx="44" cy="53" r="3" />
    <path d="M74 36 V56 L64 66" opacity="0.7" />`,
  earphones: `
    <circle cx="32" cy="34" r="12" />
    <circle cx="68" cy="34" r="12" />
    <path d="M32 46 V70 a6 6 0 0 0 6 6" opacity="0.6" />
    <path d="M68 46 V70 a6 6 0 0 1 -6 6" opacity="0.6" />`,
  haircare: `
    <path d="M36 40 H64 V82 a4 4 0 0 1 -4 4 H40 a4 4 0 0 1 -4 -4 Z" />
    <path d="M44 40 V28 h12 v12" />
    <path d="M46 28 V18 h8 v10" opacity="0.6" />
    <path d="M36 58 H64" opacity="0.4" />`,
  brush: `
    <path d="M34 14 H66 a8 8 0 0 1 8 8 V52 a24 24 0 0 1 -48 0 V22 a8 8 0 0 1 8 -8 Z" />
    <path d="M50 76 V90" />
    <path d="M38 30 V44 M50 28 V46 M62 30 V44" opacity="0.5" />`,
  sneaker: `
    <path d="M13 78 V52 a4 4 0 0 1 4 -4 h13 l9 10 q7 7 17 9 l19 4 q13 3 13 13 v2 a2 2 0 0 1 -2 2 H15 a2 2 0 0 1 -2 -2 Z" />
    <path d="M13 78 H88" opacity="0.4" />
    <path d="M32 58 l9 -9 M43 66 l9 -9 M56 71 l8 -8" opacity="0.45" />`,
  boot: `
    <path d="M34 13 h22 a2 2 0 0 1 2 2 v36 q0 11 10 16 l14 7 q9 5 9 14 v1 a2 2 0 0 1 -2 2 H34 a2 2 0 0 1 -2 -2 V15 a2 2 0 0 1 2 -2 Z" />
    <path d="M32 80 H89" opacity="0.4" />
    <path d="M58 30 H32" opacity="0.35" />`,
  monogram: `
    <path d="M30 30 H70 L30 70 H70" />`,
};

/* ------------------------------------------------------------- composition */

function grainFilter(id, intensity) {
  return `
    <filter id="${id}" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="mono"/>
      <feComponentTransfer in="mono" result="grain">
        <feFuncA type="linear" slope="${intensity}"/>
      </feComponentTransfer>
      <feComposite operator="in" in="grain" in2="SourceGraphic"/>
    </filter>`;
}

/**
 * @param {object} o
 * @param {number} o.w  pixel width
 * @param {number} o.h  pixel height
 * @param {string} o.field  key of FIELDS
 * @param {string} [o.glyph]  key of GLYPHS
 * @param {number} [o.variant]  composition index
 * @param {string} [o.label]  faint corner text
 */
function buildSvg({ w, h, field, glyph, variant = 0, label }) {
  const f = FIELDS[field] ?? FIELDS.obsidian;
  const v = variant % 5;

  // Light source drifts by variant so no two plates sit identically.
  const lx = [50, 32, 68, 50, 24][v];
  const ly = [38, 30, 44, 22, 58][v];
  const angle = [180, 155, 205, 170, 195][v];

  const min = Math.min(w, h);
  const glyphSize = min * (h > w ? 0.5 : 0.34);
  const gx = (w - glyphSize) / 2;
  const gy = (h - glyphSize) / 2 - (h > w ? min * 0.02 : 0);
  const stroke = Math.max(1, min * 0.0022);

  const accents = [
    // hairline horizon
    `<line x1="0" y1="${h * 0.72}" x2="${w}" y2="${h * 0.72}" stroke="${f.ink}" stroke-opacity="0.16" stroke-width="${stroke}"/>`,
    // large ring
    `<circle cx="${w * 0.5}" cy="${h * 0.48}" r="${min * 0.42}" fill="none" stroke="${f.ink}" stroke-opacity="0.13" stroke-width="${stroke}"/>`,
    // diagonal
    `<line x1="0" y1="${h}" x2="${w}" y2="0" stroke="${f.ink}" stroke-opacity="0.1" stroke-width="${stroke}"/>`,
    // column of light
    `<rect x="${w * 0.34}" y="0" width="${w * 0.32}" height="${h}" fill="url(#column)"/>`,
    // arc
    `<path d="M0 ${h * 0.8} Q ${w * 0.5} ${h * 0.34} ${w} ${h * 0.8}" fill="none" stroke="${f.ink}" stroke-opacity="0.15" stroke-width="${stroke}"/>`,
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="base" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${f.from}"/>
      <stop offset="100%" stop-color="${f.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="${lx}%" cy="${ly}%" r="72%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="${f.light ? 0.55 : 0.16}"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="${f.light ? 0.12 : 0.04}"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="column" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="${f.light ? 0.3 : 0.07}"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="78%">
      <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="${f.light ? 0.16 : 0.42}"/>
    </radialGradient>
    ${grainFilter("grain", f.light ? 0.09 : 0.14)}
  </defs>

  <rect width="${w}" height="${h}" fill="url(#base)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  ${accents[v]}
  ${
    glyph && GLYPHS[glyph]
      ? // Light fields need a heavier line — the ink is dark but the ground
        // gives it far less separation than an obsidian plate does.
        `<g transform="translate(${gx} ${gy}) scale(${glyphSize / 100})"
            fill="none" stroke="${f.ink}" stroke-opacity="${f.light ? 0.72 : 0.5}"
            stroke-width="${(stroke * (f.light ? 2 : 1.6) * 100) / glyphSize}"
            stroke-linecap="round" stroke-linejoin="round">${GLYPHS[glyph]}</g>`
      : ""
  }
  <rect width="${w}" height="${h}" fill="url(#vignette)"/>
  <rect width="${w}" height="${h}" filter="url(#grain)" fill="#808080" opacity="0.5"/>
  ${
    label
      ? `<text x="${w * 0.5}" y="${h - min * 0.055}" text-anchor="middle"
           font-family="Helvetica, Arial, sans-serif" font-size="${min * 0.026}"
           letter-spacing="${min * 0.012}" fill="${f.ink}" fill-opacity="0.55"
           >${label.toUpperCase()}</text>`
      : ""
  }
</svg>`;
}

async function render(relPath, opts, quality = 86) {
  const file = path.join(OUT, relPath);
  await mkdir(path.dirname(file), { recursive: true });
  const svg = buildSvg(opts);
  await sharp(Buffer.from(svg))
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toFile(file);
  return relPath;
}

/* --------------------------------------------------------------- manifest */

/** Products: three plates each — front, detail, worn. */
const PRODUCTS = [
  ["aurelia-top-handle", "bag", "obsidian"],
  ["celeste-shoulder-bag", "bag", "linen"],
  ["vaux-weekender", "bag", "graphite"],
  ["orsay-clutch", "bag", "wine"],
  ["meridian-chronograph", "watch", "midnight"],
  ["solaire-automatic", "watch", "obsidian"],
  ["nocturne-skeleton", "watch", "graphite"],
  ["lumiere-signet-ring", "jewellery", "champagne"],
  ["astra-pendant", "jewellery", "obsidian"],
  ["velours-cuff", "jewellery", "bone"],
  ["marceau-eau-de-parfum", "fragrance", "ivory"],
  ["noir-absolu", "fragrance", "obsidian"],
  ["fleur-de-sel", "fragrance", "linen"],
  ["cashmere-longline-coat", "outerwear", "smoke"],
  ["belvoir-trench", "outerwear", "bone"],
  ["alpine-shearling", "outerwear", "graphite"],
  ["duchesse-heel", "footwear", "obsidian"],
  ["monceau-loafer", "footwear", "wine"],
  ["riviera-sunglasses", "eyewear", "graphite"],
  ["opera-acetate", "eyewear", "ivory"],
  ["carre-silk-scarf", "silk", "champagne"],
  ["ondine-silk-slip", "silk", "linen"],
  ["obsidian-decanter", "home", "obsidian"],
  ["atelier-candle", "home", "forest"],
  ["auriga-headphones", "headphones", "obsidian"],
  ["sonus-table-speaker", "speaker", "graphite"],
  ["revolve-turntable", "turntable", "midnight"],
  ["aria-earphones", "earphones", "ivory"],
  ["seruma-hair-oil", "haircare", "champagne"],
  ["crin-bristle-brush", "brush", "linen"],
  ["lavande-hair-ritual", "haircare", "forest"],
  ["cirrus-low-sneaker", "sneaker", "ivory"],
  ["brecon-chelsea-boot", "boot", "graphite"],
];

const COLLECTIONS = [
  ["leather-goods", "bag", "obsidian"],
  ["timepieces", "watch", "midnight"],
  ["fine-jewellery", "jewellery", "champagne"],
  ["fragrance", "fragrance", "ivory"],
  ["ready-to-wear", "outerwear", "smoke"],
  ["footwear", "footwear", "graphite"],
  ["eyewear", "eyewear", "bone"],
  ["maison", "home", "forest"],
  ["electronics", "headphones", "obsidian"],
  ["hair", "brush", "champagne"],
];

const EDITORIAL = [
  ["the-atelier", "monogram", "graphite"],
  ["savoir-faire", "silk", "wine"],
  ["winter-solstice", "outerwear", "midnight"],
  ["the-gold-standard", "jewellery", "champagne"],
  ["hands-of-the-maison", "monogram", "bone"],
  ["a-study-in-black", "monogram", "obsidian"],
];

const JOURNAL = [
  ["cutting-the-first-hide", "bag", "wine"],
  ["six-hundred-hours", "watch", "obsidian"],
  ["the-language-of-gold", "jewellery", "champagne"],
  ["notes-on-vetiver", "fragrance", "forest"],
  ["a-coat-for-a-decade", "outerwear", "smoke"],
  ["the-quiet-house", "home", "linen"],
];

const CAMPAIGN = [
  ["hero-primary", "monogram", "obsidian"],
  ["hero-secondary", "silk", "wine"],
  ["hero-tertiary", "outerwear", "midnight"],
  ["feature-wide", "monogram", "graphite"],
  ["feature-tall", "jewellery", "champagne"],
  ["newsletter", "monogram", "linen"],
];

async function main() {
  const written = [];

  // Product plates — 3:4 portrait, the retail standard.
  for (const [slug, glyph, field] of PRODUCTS) {
    const shades = [field, field === "obsidian" ? "graphite" : "obsidian", "linen"];
    for (let i = 0; i < 3; i++) {
      written.push(
        await render(`products/${slug}-${i + 1}.jpg`, {
          w: 1200,
          h: 1600,
          field: shades[i],
          glyph,
          variant: i + FIELD_KEYS.indexOf(field),
          label: i === 0 ? undefined : undefined,
        })
      );
    }
  }

  // Collection cards — 4:5.
  for (const [slug, glyph, field] of COLLECTIONS) {
    written.push(
      await render(`collections/${slug}.jpg`, {
        w: 1400,
        h: 1750,
        field,
        glyph,
        variant: COLLECTIONS.findIndex((c) => c[0] === slug),
      })
    );
  }

  // Editorial — 3:2 landscape.
  for (const [slug, glyph, field] of EDITORIAL) {
    written.push(
      await render(`editorial/${slug}.jpg`, {
        w: 1800,
        h: 1200,
        field,
        glyph,
        variant: EDITORIAL.findIndex((e) => e[0] === slug) + 2,
      })
    );
  }

  // Journal — 3:2 landscape.
  for (const [slug, glyph, field] of JOURNAL) {
    written.push(
      await render(`journal/${slug}.jpg`, {
        w: 1800,
        h: 1200,
        field,
        glyph,
        variant: JOURNAL.findIndex((j) => j[0] === slug),
      })
    );
  }

  // Campaign — full-bleed, wide.
  const campaignSizes = {
    "hero-primary": [2400, 1500],
    "hero-secondary": [2400, 1500],
    "hero-tertiary": [2400, 1500],
    "feature-wide": [2000, 1125],
    "feature-tall": [1200, 1600],
    newsletter: [2000, 900],
  };
  for (const [slug, glyph, field] of CAMPAIGN) {
    const [w, h] = campaignSizes[slug];
    written.push(
      await render(`campaign/${slug}.jpg`, {
        w,
        h,
        field,
        glyph,
        variant: CAMPAIGN.findIndex((c) => c[0] === slug) + 1,
      }, 88)
    );
  }

  await writeFile(
    path.join(OUT, "manifest.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), files: written }, null, 2)
  );

  console.log(`Generated ${written.length} images into public/media`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
