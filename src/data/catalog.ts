import { COUNTRY_BY_NAME } from "@/lib/countries";
import type {
  Category,
  Collection,
  Currency,
  EditorialArticle,
  Product,
  ProductFlag,
  ProductImage,
  ProductOption,
  ProductOptionValue,
  ProductVariant,
} from "@/lib/types";

/**
 * The seed catalogue.
 *
 * This module is the single source of truth for the storefront today and the
 * shape the Supabase tables will be seeded from. Nothing here reaches for the
 * network, so every page can render statically.
 */

const CURRENCY: Currency = "USD";

/* --------------------------------------------------------------- countries */

export { COUNTRIES } from "@/lib/countries";

/**
 * Splits "Made in Florence, Italy" into its city and ISO country code.
 *
 * Throws on an unmapped country rather than silently defaulting: a product
 * that cannot be filtered by origin is a bug on a storefront whose whole
 * proposition is knowing where things ship from.
 */
function parseOrigin(label: string): { city: string | null; country: string } {
  const segments = label.split(",").map((s) => s.trim());
  const countryName = segments[segments.length - 1];
  const code = COUNTRY_BY_NAME[countryName];

  if (!code) {
    throw new Error(
      `Unmapped origin country ${JSON.stringify(countryName)} in ${JSON.stringify(label)}. ` +
        `Add it to COUNTRY_BY_NAME and COUNTRIES in src/data/catalog.ts.`
    );
  }

  // Strip the leading verb: "Made in Florence" → "Florence".
  const city =
    segments.length > 1
      ? segments[0].replace(/^(Made|Assembled|Poured|Printed|Set|Blended|Composed|Woven|Finished)\s+(in|and bottled in)\s+/i, "").trim()
      : null;

  return { city: city || null, country: code };
}

/* ------------------------------------------------------------ swatch atlas */

const SWATCH = {
  noir: ["Noir", "#0a0a0b"],
  onyx: ["Onyx", "#1b1b21"],
  graphite: ["Graphite", "#3d3d44"],
  smoke: ["Smoke", "#6e6e78"],
  silver: ["Silver", "#c9c9d0"],
  ivory: ["Ivory", "#f2ede3"],
  ecru: ["Écru", "#e3d9c6"],
  bone: ["Bone", "#d8cfc0"],
  taupe: ["Taupe", "#a3927c"],
  camel: ["Camel", "#b08d5b"],
  cognac: ["Cognac", "#8a5a2b"],
  champagne: ["Champagne", "#c0a062"],
  gold: ["Yellow Gold", "#b8944e"],
  whiteGold: ["White Gold", "#cfd2d6"],
  roseGold: ["Rose Gold", "#c99b83"],
  bordeaux: ["Bordeaux", "#5c1f2b"],
  forest: ["Forest", "#1f3a30"],
  midnight: ["Midnight", "#12203a"],
  tortoise: ["Tortoise", "#6b4423"],
} as const satisfies Record<string, readonly [string, string]>;

type SwatchKey = keyof typeof SWATCH;

/* --------------------------------------------------- deterministic filler
 * Inventory and review counts must be identical on the server and the client,
 * so they are derived from the entity id rather than Math.random().
 */

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededInt(seed: string, min: number, max: number) {
  return min + (hash(seed) % (max - min + 1));
}

/* ------------------------------------------------------------- categories */

export const CATEGORIES: Category[] = [
  {
    slug: "leather-goods",
    name: "Leather Goods",
    group: "Collections",
    description:
      "Vegetable-tanned hides cut by hand, saddle-stitched, and finished with a burnished edge that deepens with wear.",
  },
  {
    slug: "timepieces",
    name: "Timepieces",
    group: "Collections",
    description:
      "Mechanical movements assembled in the Vallée de Joux, cased in steel and sapphire, regulated across five positions.",
  },
  {
    slug: "fine-jewellery",
    name: "Fine Jewellery",
    group: "Collections",
    description:
      "Solid gold, set by hand. Each piece is hallmarked, numbered, and accompanied by its own certificate.",
  },
  {
    slug: "fragrance",
    name: "Fragrance",
    group: "Collections",
    description:
      "Compositions built in Grasse from natural absolutes, aged six months in glass before bottling.",
  },
  {
    slug: "ready-to-wear",
    name: "Ready-to-Wear",
    group: "Collections",
    description:
      "Outerwear cut from mills that have supplied the house for four decades. Canvassed, never fused.",
  },
  {
    slug: "footwear",
    name: "Footwear",
    group: "Collections",
    description:
      "Blake-stitched and hand-lasted in Tuscany, on forms refined over twenty seasons.",
  },
  {
    slug: "eyewear",
    name: "Eyewear",
    group: "Collections",
    description:
      "Italian acetate cured for eight months, milled from solid block and polished in rotating drums.",
  },
  {
    slug: "maison",
    name: "Maison",
    group: "Collections",
    description:
      "Objects for the home — mouth-blown glass, hand-poured wax, and cast brass.",
  },
  {
    slug: "electronics",
    name: "Sound & Electronics",
    group: "Collections",
    description:
      "Audio built the way instruments are — machined aluminium, paper cones, and drivers matched by ear before they leave the bench.",
  },
  {
    slug: "hair",
    name: "Hair",
    group: "Collections",
    description:
      "Cold-pressed oils, boar bristle set into pear wood, and formulas made in small batches without silicone or sulphates.",
  },
];

/* ------------------------------------------------------------ collections */

export const COLLECTIONS: Collection[] = [
  {
    slug: "the-obsidian-edit",
    name: "The Obsidian Edit",
    tagline: "Black, in nine registers",
    description:
      "A single colour studied across leather, steel, silk and glass. The discipline is not in the shade but in the surface — matte against lacquer, grain against polish.",
    image: {
      id: "col-obsidian",
      url: "/media/editorial/a-study-in-black.jpg",
      alt: "A study in black — the Obsidian Edit",
      width: 1800,
      height: 1200,
      position: 0,
    },
    position: 0,
    isFeatured: true,
  },
  {
    slug: "gold-standard",
    name: "Gold Standard",
    tagline: "18-carat, and nothing beneath it",
    description:
      "Solid gold throughout. No plating, no vermeil, no compromise at the clasp. Pieces intended to be worn daily for thirty years and then handed on.",
    image: {
      id: "col-gold",
      url: "/media/editorial/the-gold-standard.jpg",
      alt: "Gold Standard collection",
      width: 1800,
      height: 1200,
      position: 0,
    },
    position: 1,
    isFeatured: true,
  },
  {
    slug: "winter-solstice",
    name: "Winter Solstice",
    tagline: "Outerwear for the long dark",
    description:
      "Weight, drape and warmth, in that order. Cashmere from Biella, shearling from Toscana, and a trench that has not changed pattern since 1974.",
    image: {
      id: "col-winter",
      url: "/media/editorial/winter-solstice.jpg",
      alt: "Winter Solstice outerwear",
      width: 1800,
      height: 1200,
      position: 0,
    },
    position: 2,
    isFeatured: true,
  },
  {
    slug: "savoir-faire",
    name: "Savoir-Faire",
    tagline: "The pieces that take longest",
    description:
      "Everything in this edit is made to order. Expect to wait. The scarf is screen-printed in twenty-two passes; the signet is carved, not cast.",
    image: {
      id: "col-savoir",
      url: "/media/editorial/savoir-faire.jpg",
      alt: "Savoir-Faire made-to-order edit",
      width: 1800,
      height: 1200,
      position: 0,
    },
    position: 3,
    isFeatured: true,
  },
  {
    slug: "the-atelier-series",
    name: "The Atelier Series",
    tagline: "Numbered, and never repeated",
    description:
      "Small runs from the workshop floor — trial hides, single-bolt silks, experiments that earned a second look. When they are gone the pattern is retired.",
    image: {
      id: "col-atelier",
      url: "/media/editorial/the-atelier.jpg",
      alt: "The Atelier Series",
      width: 1800,
      height: 1200,
      position: 0,
    },
    position: 4,
    isFeatured: false,
  },
  {
    slug: "hands-of-the-maison",
    name: "Hands of the Maison",
    tagline: "Signed by the maker",
    description:
      "Each piece carries the mark of the artisan who finished it. Nine hands, one house, and a register kept since the first workshop opened.",
    image: {
      id: "col-hands",
      url: "/media/editorial/hands-of-the-maison.jpg",
      alt: "Hands of the Maison",
      width: 1800,
      height: 1200,
      position: 0,
    },
    position: 5,
    isFeatured: false,
  },
];

/* ------------------------------------------------------------ product seed */

interface Seed {
  slug: string;
  name: string;
  tagline: string;
  excerpt: string;
  description: string;
  story: string;
  details: string[];
  care: string[];
  composition: string;
  origin: string;
  category: string;
  collections: string[];
  price: number;
  compareAtPrice?: number;
  colors: SwatchKey[];
  sizeLabel?: string;
  sizes?: string[];
  rating: number;
  flags?: ProductFlag[];
  featured?: boolean;
  /** Variants whose index is listed are held at zero stock. */
  soldOut?: number[];
  publishedAt: string;
}

const STANDARD_CARE = [
  "Store in the accompanying dust bag, away from direct sunlight.",
  "Avoid prolonged contact with water, alcohol and fragrance.",
  "Return to any boutique for complimentary conditioning once a year.",
];

const SEEDS: Seed[] = [
  /* ---------------------------------------------------- leather goods */
  {
    slug: "aurelia-top-handle",
    name: "Aurelia Top-Handle",
    tagline: "The house's first bag, still cut on the original pattern",
    excerpt:
      "A structured top-handle in vegetable-tanned calf, saddle-stitched by a single artisan from first cut to final burnish.",
    description:
      "Aurelia is the bag the house was founded on. The pattern has been altered twice in forty years — once to lengthen the handle by eleven millimetres, once to move the interior pocket. Everything else is as it was. The body is cut from a single hide so the grain runs continuously around the corners, a decision that wastes roughly a third of the skin and is the reason we make so few.",
    story:
      "The tannery is in Santa Croce sull'Arno and has been in the same family since 1946. Hides rest in pits of chestnut and mimosa bark for forty days — a process ten times slower than chrome tanning and the only one that produces leather which darkens rather than cracks. We buy the first grade only. What we reject goes back.",
    details: [
      "Vegetable-tanned full-grain calfskin, 2.2mm",
      "Hand saddle-stitched with waxed linen thread",
      "Solid brass hardware, hand-burnished edges",
      "Suede-lined interior with one slip and one zip pocket",
      "28 × 22 × 13 cm — fits a 13\" laptop",
      "Detachable 112 cm shoulder strap included",
    ],
    care: STANDARD_CARE,
    composition: "100% vegetable-tanned calfskin; brass hardware",
    origin: "Made in Florence, Italy",
    category: "leather-goods",
    collections: ["the-obsidian-edit", "hands-of-the-maison"],
    price: 428000,
    colors: ["noir", "cognac", "bordeaux"],
    rating: 4.9,
    flags: ["exclusive"],
    featured: true,
    publishedAt: "2025-09-02",
  },
  {
    slug: "celeste-shoulder-bag",
    name: "Céleste Shoulder Bag",
    tagline: "Unstructured, and better for it",
    excerpt:
      "A soft-bodied shoulder bag in glove-tanned lambskin that settles into the shape of whoever carries it.",
    description:
      "Where Aurelia is architecture, Céleste is drape. The lambskin is tanned to a hand soft enough to fold into a coat pocket, then hung for six weeks before cutting so it will not stretch unevenly. There is no interior frame. The bag takes its shape from what you put in it and keeps a memory of it afterwards.",
    story:
      "Softness is harder than structure. A rigid bag hides its seams; an unlined one shows every stitch on both faces. Our cutters spend two years on structured work before they are allowed near a Céleste.",
    details: [
      "Glove-tanned lambskin, unlined body",
      "Hand-rolled strap, 58 cm drop",
      "Magnetic closure under a leather tab",
      "Interior patch pocket in matching hide",
      "32 × 26 × 9 cm",
    ],
    care: STANDARD_CARE,
    composition: "100% lambskin; palladium-plated hardware",
    origin: "Made in Florence, Italy",
    category: "leather-goods",
    collections: ["hands-of-the-maison"],
    price: 296000,
    compareAtPrice: 340000,
    colors: ["ivory", "taupe", "noir", "forest"],
    rating: 4.7,
    featured: true,
    publishedAt: "2025-10-14",
  },
  {
    slug: "vaux-weekender",
    name: "Vaux Weekender",
    tagline: "Two nights, carried properly",
    excerpt:
      "A holdall in bridle leather and heavy cotton canvas, built on a brass frame that will outlast the bag.",
    description:
      "Vaux was drawn for a client who wanted one bag for the rest of his working life. It is over-engineered on purpose: a solid brass frame, double-riveted handle roots, and a base of 4mm bridle leather with brass feet. It weighs more than a nylon equivalent. It is also the last one you will buy.",
    story:
      "Bridle leather is finished with tallow and beeswax over several weeks, then hand-rubbed until the surface takes on a low sheen. It was developed for harness and is, by some distance, the most durable leather made.",
    details: [
      "Bridle leather trim with 18oz cotton canvas body",
      "Solid brass frame and protective base studs",
      "Two-way brass zip with leather pulls",
      "Removable padded shoulder strap",
      "54 × 30 × 26 cm — 42 litre capacity",
    ],
    care: STANDARD_CARE,
    composition: "Bridle leather; 18oz cotton canvas; solid brass",
    origin: "Made in Walsall, England",
    category: "leather-goods",
    collections: ["the-atelier-series"],
    price: 512000,
    colors: ["graphite", "cognac", "midnight"],
    rating: 4.8,
    flags: ["limited"],
    publishedAt: "2025-07-21",
  },
  {
    slug: "orsay-clutch",
    name: "Orsay Clutch",
    tagline: "For evenings that do not require pockets",
    excerpt:
      "A slim envelope clutch in box calf with a hand-set clasp in solid brass.",
    description:
      "Box calf takes a mirror polish that no other hide will hold. It is also unforgiving — a single misplaced stitch cannot be re-sewn, because the old holes remain visible. Orsay is made by two people in the workshop and no others.",
    story:
      "The clasp is machined from bar stock, not cast, then hand-polished through six grades of abrasive. It takes ninety minutes and is the reason the bag costs what it does.",
    details: [
      "Polished box calf leather",
      "Hand-machined solid brass clasp",
      "Grosgrain-lined interior with card slip",
      "24 × 14 × 3 cm",
      "Optional fine chain strap, 120 cm",
    ],
    care: STANDARD_CARE,
    composition: "Box calf leather; solid brass; silk grosgrain lining",
    origin: "Made in Paris, France",
    category: "leather-goods",
    collections: ["the-obsidian-edit"],
    price: 184000,
    colors: ["noir", "bordeaux", "champagne"],
    rating: 4.6,
    publishedAt: "2025-11-05",
  },

  /* -------------------------------------------------------- timepieces */
  {
    slug: "meridian-chronograph",
    name: "Meridian Chronograph",
    tagline: "A column-wheel movement, visible from the back",
    excerpt:
      "A 41mm manual-wind chronograph with a column-wheel calibre finished by hand and regulated in five positions.",
    description:
      "The column wheel is the expensive way to build a chronograph and the only way to get the pusher feel right — a clean, deliberate click with no travel before engagement. The calibre is finished with Geneva stripes on the bridges, circular graining on the mainplate, and chamfered edges polished by hand.",
    story:
      "Regulation across five positions takes a week per watch. Most of it is waiting: the movement is timed, adjusted, then left to settle for forty-eight hours before the next reading. There is no way to compress it.",
    details: [
      "Manual-wind column-wheel chronograph calibre, 60-hour reserve",
      "41mm polished and brushed steel case, 50m water resistance",
      "Domed sapphire crystal with double anti-reflective coating",
      "Exhibition caseback, hand-finished bridges",
      "Alligator strap with steel pin buckle",
    ],
    care: [
      "Service every five to seven years at an authorised workshop.",
      "Do not operate pushers underwater.",
      "Avoid magnetic fields and sudden temperature change.",
    ],
    composition: "Stainless steel case; sapphire crystal; alligator strap",
    origin: "Assembled in Le Sentier, Switzerland",
    category: "timepieces",
    collections: ["hands-of-the-maison"],
    price: 1240000,
    colors: ["midnight", "silver", "noir"],
    sizeLabel: "Case",
    sizes: ["38mm", "41mm"],
    rating: 4.9,
    flags: ["limited"],
    featured: true,
    publishedAt: "2025-06-18",
  },
  {
    slug: "solaire-automatic",
    name: "Solaire Automatic",
    tagline: "The everyday watch, done without apology",
    excerpt:
      "A 38mm automatic with a sunburst dial, applied indices and a 72-hour reserve.",
    description:
      "Solaire is deliberately unremarkable in the way that good tools are. It reads instantly in any light, survives a life of desks and doors, and runs for three days off the wrist. The dial is stamped, lacquered and sunburst-brushed in four operations.",
    story:
      "We spent longer on the hands than on anything else. They are faceted, polished on the upper surface and brushed on the flank, so they catch light against the dial at any angle rather than disappearing into it.",
    details: [
      "Automatic calibre, 72-hour power reserve, 28,800 vph",
      "38mm brushed steel case, 100m water resistance",
      "Sunburst lacquer dial with applied indices",
      "Screw-down crown, sapphire crystal",
      "Steel bracelet with micro-adjust clasp",
    ],
    care: [
      "Service every five to seven years at an authorised workshop.",
      "Rinse with fresh water after contact with salt water.",
    ],
    composition: "Stainless steel; sapphire crystal",
    origin: "Assembled in Le Sentier, Switzerland",
    category: "timepieces",
    collections: [],
    price: 685000,
    compareAtPrice: 760000,
    colors: ["silver", "midnight", "forest"],
    sizeLabel: "Case",
    sizes: ["36mm", "38mm", "41mm"],
    rating: 4.8,
    featured: true,
    publishedAt: "2025-08-30",
  },
  {
    slug: "nocturne-skeleton",
    name: "Nocturne Skeleton",
    tagline: "Everything removed that could be",
    excerpt:
      "A hand-skeletonised movement in a blackened case — 214 hours of file work per piece.",
    description:
      "Skeletonising is subtraction under load: every gram removed weakens the bridge that remains, so the shape of what is left is a structural argument as much as an aesthetic one. Ours is cut by one engraver, by hand, over roughly five weeks.",
    story:
      "The engraver has been at the bench thirty-one years. He signs the underside of the barrel bridge where only a watchmaker will ever see it.",
    details: [
      "Hand-skeletonised manual calibre, 45-hour reserve",
      "40mm DLC-coated steel case",
      "Sapphire crystal front and back",
      "Anthracite alligator strap, hand-stitched",
      "Numbered edition of 150",
    ],
    care: [
      "Service every five years at an authorised workshop.",
      "Not suitable for swimming or showering.",
    ],
    composition: "DLC-coated steel; sapphire; alligator strap",
    origin: "Assembled in Le Sentier, Switzerland",
    category: "timepieces",
    collections: ["the-obsidian-edit", "the-atelier-series"],
    price: 2480000,
    colors: ["noir", "graphite"],
    sizeLabel: "Case",
    sizes: ["40mm"],
    rating: 5,
    flags: ["limited", "made-to-order"],
    soldOut: [1],
    publishedAt: "2025-05-09",
  },

  /* ---------------------------------------------------- fine jewellery */
  {
    slug: "lumiere-signet-ring",
    name: "Lumière Signet",
    tagline: "Carved from solid stock, never cast",
    excerpt:
      "An 18-carat signet cut from a single billet of gold, with an optional hand-engraved face.",
    description:
      "Cast rings are hollow-hearted and porous; carved rings are dense the whole way through and ring when struck. Lumière is milled from solid 18-carat stock and finished by hand, which is why it weighs almost twice what its silhouette suggests.",
    story:
      "If you choose engraving, the face is cut by hand with a graver — no lasers. Allow three weeks. The engraver will send a pencil rubbing for approval before touching the gold.",
    details: [
      "18-carat gold, carved from solid billet",
      "Hallmarked and numbered on the inner band",
      "Optional hand-engraved face — allow 3 weeks",
      "Approximately 14g depending on size",
      "Presented in a lacquered case",
    ],
    care: [
      "Remove before swimming, sport or sleep.",
      "Clean with warm water and a soft cloth.",
      "Complimentary re-polishing for life.",
    ],
    composition: "18-carat gold",
    origin: "Made in Vicenza, Italy",
    category: "fine-jewellery",
    collections: ["gold-standard", "savoir-faire"],
    price: 342000,
    colors: ["gold", "whiteGold", "roseGold"],
    sizeLabel: "Size",
    sizes: ["48", "50", "52", "54", "56", "58", "60"],
    rating: 4.9,
    flags: ["made-to-order"],
    featured: true,
    publishedAt: "2025-04-12",
  },
  {
    slug: "astra-pendant",
    name: "Astra Pendant",
    tagline: "One stone, held by four claws and nothing else",
    excerpt:
      "A solitaire pendant on a 45cm chain, set by hand with a certificated brilliant-cut diamond.",
    description:
      "The setting is as thin as the metal will safely allow so that light enters the stone from the sides as well as the face. Four claws, no gallery, no collet — the diamond appears to float against the skin.",
    story:
      "Every stone is selected in person from a single cutter in Antwerp. We buy for cut above all else: a well-cut stone of modest weight will outshine a heavier one every time.",
    details: [
      "0.35ct brilliant-cut diamond, G colour, VS clarity",
      "GIA certificate supplied",
      "18-carat gold four-claw setting",
      "45cm cable chain with adjustable 42cm loop",
      "Hallmarked at the clasp",
    ],
    care: [
      "Remove before swimming, sport or sleep.",
      "Have the setting checked annually.",
    ],
    composition: "18-carat gold; certificated diamond",
    origin: "Set in Antwerp, Belgium",
    category: "fine-jewellery",
    collections: ["gold-standard"],
    price: 268000,
    colors: ["gold", "whiteGold"],
    rating: 4.8,
    publishedAt: "2025-09-26",
  },
  {
    slug: "velours-cuff",
    name: "Velours Cuff",
    tagline: "Brushed to a nap, not a shine",
    excerpt:
      "A wide open cuff in 18-carat gold, finished with a directional brush that catches light like suede.",
    description:
      "Most gold is polished because it is easier to sell. Velours is brushed in one direction with a fine wire wheel, which softens the metal's glare and shows fingerprints far less. It is a quieter object and, we think, a more wearable one.",
    story:
      "The brush finish is applied last, after hallmarking, so the marks sit slightly proud of the surface and remain legible for decades.",
    details: [
      "18-carat gold, 22mm wide",
      "Directional brushed finish",
      "Open-back construction, gently adjustable",
      "Approximately 38g",
      "Hallmarked on the inner face",
    ],
    care: [
      "Adjust only at a boutique — repeated flexing fatigues the metal.",
      "Clean with a soft dry cloth.",
    ],
    composition: "18-carat gold",
    origin: "Made in Vicenza, Italy",
    category: "fine-jewellery",
    collections: ["gold-standard", "hands-of-the-maison"],
    price: 596000,
    colors: ["gold", "roseGold"],
    sizeLabel: "Size",
    sizes: ["Small", "Medium", "Large"],
    rating: 4.7,
    publishedAt: "2025-03-19",
  },

  /* -------------------------------------------------------- fragrance */
  {
    slug: "marceau-eau-de-parfum",
    name: "Marceau",
    tagline: "Neroli, orris and warm paper",
    excerpt:
      "A luminous eau de parfum built on Tunisian neroli and Florentine orris, aged six months before bottling.",
    description:
      "Marceau opens sharp and green and settles, over about twenty minutes, into something powdery and warm — orris butter, a little ambrette, and a dry woody base that reads faintly of old books. It lasts seven to nine hours on skin.",
    story:
      "Orris butter is the most expensive natural material in perfumery. The rhizomes are dried for three years before distillation, and it takes roughly a tonne of them to yield two kilograms of butter. There is no synthetic substitute that behaves the same way on skin.",
    details: [
      "Eau de parfum, 18% concentration",
      "Top: Tunisian neroli, bergamot, green mandarin",
      "Heart: Florentine orris butter, ambrette seed",
      "Base: sandalwood, ambergris accord, white musk",
      "Aged six months in glass before bottling",
    ],
    care: [
      "Store upright, away from light and heat.",
      "Do not decant into plastic.",
    ],
    composition: "Alcohol denat., parfum, aqua",
    origin: "Composed and bottled in Grasse, France",
    category: "fragrance",
    collections: ["savoir-faire"],
    price: 32000,
    colors: ["ivory"],
    sizeLabel: "Volume",
    sizes: ["50ml", "100ml", "200ml"],
    rating: 4.8,
    featured: true,
    publishedAt: "2025-10-01",
  },
  {
    slug: "noir-absolu",
    name: "Noir Absolu",
    tagline: "Leather, smoke and a long shadow",
    excerpt:
      "A dense leather-and-birch-tar composition for cold air. Worn sparingly.",
    description:
      "Noir Absolu is not a polite fragrance. Birch tar and styrax give it a smoked-leather core; labdanum and vanilla absolute keep it from turning medicinal. One spray is usually enough. It will outlast the evening.",
    story:
      "Birch tar is what gives Russian leather its smell — the hides were traditionally dressed with it to repel water and insects. Its use in perfumery is restricted, which is why so few modern leathers smell like the real thing.",
    details: [
      "Extrait de parfum, 25% concentration",
      "Top: black pepper, cypress",
      "Heart: birch tar, styrax, leather accord",
      "Base: labdanum, vanilla absolute, vetiver",
      "Twelve-hour wear on skin",
    ],
    care: ["Store upright, away from light and heat."],
    composition: "Alcohol denat., parfum, aqua",
    origin: "Composed and bottled in Grasse, France",
    category: "fragrance",
    collections: ["the-obsidian-edit"],
    price: 41000,
    colors: ["noir"],
    sizeLabel: "Volume",
    sizes: ["50ml", "100ml"],
    rating: 4.6,
    flags: ["exclusive"],
    publishedAt: "2025-11-18",
  },
  {
    slug: "fleur-de-sel",
    name: "Fleur de Sel",
    tagline: "Salt air, fig leaf and sun-warmed stone",
    excerpt:
      "A bright saline eau de toilette that behaves like a coastal morning.",
    description:
      "Built around a salt accord and green fig, with just enough ambrette to keep it from smelling like a candle. It is deliberately light — three to four hours — and made to be reapplied.",
    story:
      "The fig note is not a fig fruit but a fig leaf: milky, green, slightly bitter. It is the smell of the tree rather than the harvest.",
    details: [
      "Eau de toilette, 12% concentration",
      "Top: salt accord, green mandarin, fig leaf",
      "Heart: jasmine sambac, ambrette",
      "Base: driftwood, white amber",
      "Three to four hour wear",
    ],
    care: ["Store upright, away from light and heat."],
    composition: "Alcohol denat., parfum, aqua",
    origin: "Composed and bottled in Grasse, France",
    category: "fragrance",
    collections: [],
    price: 24000,
    compareAtPrice: 28000,
    colors: ["ecru"],
    sizeLabel: "Volume",
    sizes: ["50ml", "100ml"],
    rating: 4.5,
    publishedAt: "2026-01-08",
  },

  /* ---------------------------------------------------- ready-to-wear */
  {
    slug: "cashmere-longline-coat",
    name: "Longline Cashmere Coat",
    tagline: "Double-faced, so there is no lining to fail",
    excerpt:
      "A full-length coat in double-faced Italian cashmere, joined entirely by hand.",
    description:
      "Double-faced cashmere is two cloths woven as one and then split by hand along the seam allowance so the edges can be closed invisibly. There is no lining because there is no wrong side. The work is slow — around thirty hours of hand-sewing per coat — and it produces a garment that drapes without any internal structure at all.",
    story:
      "The cloth comes from a mill outside Biella that has been weaving cashmere since 1663. We take the 780-gram weight, which is heavy enough to hang straight in wind.",
    details: [
      "Double-faced cashmere, 780gsm, woven in Biella",
      "Hand-closed seams throughout — no lining",
      "Concealed placket, horn buttons",
      "Full-length, 118cm centre back",
      "Two welt pockets, hand-finished",
    ],
    care: [
      "Dry clean by a specialist only.",
      "Store on a broad wooden hanger.",
      "Brush after wear to lift the nap.",
    ],
    composition: "100% cashmere; horn buttons",
    origin: "Made in Biella, Italy",
    category: "ready-to-wear",
    collections: ["winter-solstice", "savoir-faire"],
    price: 892000,
    colors: ["camel", "graphite", "noir", "ivory"],
    sizeLabel: "Size",
    sizes: ["XS", "S", "M", "L", "XL"],
    rating: 4.9,
    flags: ["made-to-order"],
    featured: true,
    soldOut: [3, 11],
    publishedAt: "2025-09-15",
  },
  {
    slug: "belvoir-trench",
    name: "Belvoir Trench",
    tagline: "The 1974 pattern, unchanged",
    excerpt:
      "A cotton gabardine trench cut on the house's original block, with every storm feature intact.",
    description:
      "Storm flap, gun flap, throat latch, D-ring belt, and a raglan sleeve that lets you swing an arm without lifting the hem. None of these are decorative; each solved a specific problem for someone standing outside in weather. We have kept them all.",
    story:
      "The gabardine is woven so densely — around 100 threads per centimetre — that it sheds rain without any coating at all. It softens over about two seasons and then stops changing.",
    details: [
      "Cotton gabardine, undyed horn buttons",
      "Raglan sleeve with adjustable cuff strap",
      "Storm flap, gun flap and throat latch",
      "Removable wool-blend warmer",
      "104cm centre back",
    ],
    care: [
      "Dry clean only.",
      "Do not machine wash — it will collapse the weave.",
    ],
    composition: "100% cotton gabardine; horn buttons",
    origin: "Made in Castleford, England",
    category: "ready-to-wear",
    collections: ["winter-solstice"],
    price: 456000,
    colors: ["bone", "midnight", "forest"],
    sizeLabel: "Size",
    sizes: ["XS", "S", "M", "L", "XL"],
    rating: 4.8,
    publishedAt: "2025-08-04",
  },
  {
    slug: "alpine-shearling",
    name: "Alpine Shearling",
    tagline: "One skin, worn both ways round",
    excerpt:
      "A Tuscan shearling with the wool turned in and the suede out, entirely unlined.",
    description:
      "Shearling is a single skin with the fleece still attached, which makes it the warmest thing you can wear for its weight and the least forgiving to cut. There is no second chance: a wrong seam shows on both faces at once.",
    story:
      "The skins are from Toscana and are tanned with the wool intact, a process that takes eleven weeks. We use entire skins and match the nap across the shoulder seam by eye.",
    details: [
      "Tuscan shearling, entire skins, unlined",
      "Suede exterior with 18mm wool",
      "Concealed hook-and-bar front",
      "Two hand-warmer pockets",
      "82cm centre back",
    ],
    care: [
      "Specialist shearling cleaning only.",
      "Air after wear; never store in plastic.",
    ],
    composition: "100% shearling (lambskin with wool)",
    origin: "Made in Toscana, Italy",
    category: "ready-to-wear",
    collections: ["winter-solstice", "the-atelier-series"],
    price: 738000,
    colors: ["taupe", "cognac", "graphite"],
    sizeLabel: "Size",
    sizes: ["S", "M", "L", "XL"],
    rating: 4.7,
    flags: ["limited"],
    publishedAt: "2025-10-22",
  },

  /* ---------------------------------------------------------- footwear */
  {
    slug: "duchesse-heel",
    name: "Duchesse Heel",
    tagline: "A 75mm heel you can actually stand in",
    excerpt:
      "A leather-soled court shoe on a hand-carved last, with the heel set forward of the anatomical centre.",
    description:
      "The heel is positioned two millimetres forward of where geometry suggests, which puts the weight through the arch instead of the ball of the foot. It is the difference between an hour and an evening. Blake-stitched so it can be resoled indefinitely.",
    story:
      "The last was carved by hand in beech and has been adjusted every season for twenty years based on returns and repairs. It is the most valuable object in the workshop.",
    details: [
      "Nappa leather upper, leather-lined",
      "75mm stacked leather heel",
      "Blake-stitched leather sole with rubber insert",
      "Hand-lasted on a beech form",
      "Available in half sizes",
    ],
    care: [
      "Use shoe trees between wears.",
      "Resole before the welt is reached.",
    ],
    composition: "Nappa leather upper, lining and sole",
    origin: "Made in Toscana, Italy",
    category: "footwear",
    collections: ["the-obsidian-edit"],
    price: 214000,
    colors: ["noir", "bordeaux", "ivory"],
    sizeLabel: "Size",
    sizes: ["35", "36", "37", "38", "39", "40", "41"],
    rating: 4.6,
    publishedAt: "2025-07-08",
  },
  {
    slug: "monceau-loafer",
    name: "Monceau Loafer",
    tagline: "Unlined, and softer by the week",
    excerpt:
      "A hand-sewn apron-front loafer in unlined suede, built to collapse comfortably around the foot.",
    description:
      "The apron is sewn by hand — around 180 stitches, each one pulled to the same tension by feel. Machine-sewn aprons look similar for a season and then pucker. These do not.",
    story:
      "Unlined construction means the suede sits directly against the foot and moulds to it within about ten wears. It also means every flaw in the skin is visible, so we use only the top grade.",
    details: [
      "Unlined suede upper, hand-sewn apron",
      "Blake-stitched leather sole",
      "Hand-lasted, 12mm heel",
      "Available in half sizes",
    ],
    care: [
      "Brush with a crepe block after wear.",
      "Protect with a suede spray before first use.",
    ],
    composition: "Suede upper; leather sole",
    origin: "Made in Toscana, Italy",
    category: "footwear",
    collections: ["hands-of-the-maison"],
    price: 168000,
    compareAtPrice: 195000,
    colors: ["cognac", "midnight", "noir", "taupe"],
    sizeLabel: "Size",
    sizes: ["39", "40", "41", "42", "43", "44", "45"],
    rating: 4.7,
    publishedAt: "2025-06-02",
  },

  /* ----------------------------------------------------------- eyewear */
  {
    slug: "riviera-sunglasses",
    name: "Riviera Sunglasses",
    tagline: "Milled from block acetate, cured eight months",
    excerpt:
      "An oversized acetate frame with mineral glass lenses and hand-riveted hinges.",
    description:
      "Injection-moulded frames are made in ninety seconds. Block acetate is cured for eight months, milled from solid sheet, then tumbled in wooden drums with pumice for three days to bring up the shine. The difference is in the depth of the material — the colour runs all the way through.",
    story:
      "Mineral glass lenses, not polycarbonate. They are heavier and they can break, but they do not scratch and they do not distort at the edges.",
    details: [
      "Italian block acetate, eight-month cure",
      "Mineral glass lenses, 100% UV protection",
      "Hand-riveted seven-barrel hinges",
      "52-20-145 fit",
      "Leather case and cloth included",
    ],
    care: [
      "Clean with the supplied cloth only.",
      "Have hinges adjusted at a boutique.",
    ],
    composition: "Cellulose acetate; mineral glass; nickel-silver hinges",
    origin: "Made in Cadore, Italy",
    category: "eyewear",
    collections: [],
    price: 62000,
    colors: ["tortoise", "noir", "champagne"],
    rating: 4.5,
    publishedAt: "2025-05-27",
  },
  {
    slug: "opera-acetate",
    name: "Opéra Optical",
    tagline: "A reading frame with real presence",
    excerpt:
      "A rounded optical frame in pale acetate, supplied with demo lenses for your prescription.",
    description:
      "Cut slightly wider at the temple than the eye, which keeps the frame from crowding the face at close range. Supplied with demo lenses; take it to any optician for glazing.",
    story:
      "Pale acetate is the hardest colour to make well. Any inconsistency in the cure shows as a cloud in the material, so the reject rate is roughly one frame in five.",
    details: [
      "Italian block acetate",
      "Demo lenses supplied — glazing not included",
      "Seven-barrel hinges",
      "49-21-145 fit",
      "Leather case and cloth included",
    ],
    care: ["Clean with the supplied cloth only."],
    composition: "Cellulose acetate; nickel-silver hinges",
    origin: "Made in Cadore, Italy",
    category: "eyewear",
    collections: [],
    price: 48000,
    colors: ["ecru", "tortoise", "smoke"],
    rating: 4.4,
    publishedAt: "2026-02-11",
  },

  /* ---------------------------------------------------- silk & maison */
  {
    slug: "carre-silk-scarf",
    name: "Carré Silk Scarf",
    tagline: "Twenty-two screens, one colour at a time",
    excerpt:
      "A 90cm silk twill square, screen-printed by hand and finished with a rolled hem.",
    description:
      "Each colour in the design requires its own screen, and each screen must dry fully before the next is laid. Twenty-two colours means twenty-two passes over several days. The hem is rolled and sewn by hand — the stitch is invisible from the front and the edge stays plump rather than flat.",
    story:
      "The engraver who separates the artwork into screens has done so for thirty years. A complex design takes him around six weeks before printing can begin at all.",
    details: [
      "90 × 90 cm silk twill, 16 momme",
      "Hand screen-printed, 22 colours",
      "Hand-rolled and hand-stitched hem",
      "Presented in a printed box",
    ],
    care: [
      "Dry clean only.",
      "Press on the reverse with a cool iron.",
      "Store flat or loosely rolled.",
    ],
    composition: "100% silk twill",
    origin: "Printed in Lyon, France",
    category: "maison",
    collections: ["savoir-faire", "hands-of-the-maison"],
    price: 58000,
    colors: ["champagne", "bordeaux", "midnight", "ivory"],
    rating: 4.8,
    flags: ["new"],
    featured: true,
    publishedAt: "2026-03-04",
  },
  {
    slug: "ondine-silk-slip",
    name: "Ondine Silk Slip",
    tagline: "Cut on the bias, so it moves with you",
    excerpt:
      "A bias-cut slip in 22-momme sandwashed silk, with French seams throughout.",
    description:
      "Bias cutting turns the grain forty-five degrees so the cloth stretches where the body does. It also triples the fabric required and makes every seam a matter of judgement, because the pieces move under the needle.",
    story:
      "Sandwashing gives silk a matte, fluid hand by tumbling it with fine abrasive. It is a finishing process that costs more than the weaving.",
    details: [
      "22-momme sandwashed silk",
      "Bias-cut body, French seams",
      "Adjustable straps",
      "Midi length, 118cm",
    ],
    care: ["Hand wash cold or dry clean.", "Line dry away from direct sun."],
    composition: "100% silk",
    origin: "Made in Jaipur, India",
    category: "maison",
    collections: ["the-atelier-series"],
    price: 84000,
    colors: ["ivory", "noir", "bordeaux", "forest"],
    sizeLabel: "Size",
    sizes: ["XS", "S", "M", "L"],
    rating: 4.6,
    flags: ["new"],
    publishedAt: "2026-02-24",
  },
  {
    slug: "obsidian-decanter",
    name: "Obsidian Decanter",
    tagline: "Mouth-blown, then cut by hand",
    excerpt:
      "A smoked crystal decanter, mouth-blown and hand-cut with a ground stopper.",
    description:
      "Blown by two people working together — one gathering, one shaping — then annealed overnight and cut on a wheel by hand. The stopper is ground to its own neck, so each pair is unique and marked accordingly on the base.",
    story:
      "The smoke in the glass comes from manganese added to the batch. It is a nineteenth-century technique and there is no modern shortcut that produces the same depth.",
    details: [
      "Mouth-blown lead-free crystal",
      "Hand-cut facets, ground stopper",
      "1.1 litre capacity, 26cm tall",
      "Each piece individually numbered",
    ],
    care: [
      "Hand wash only, in warm water without detergent.",
      "Dry inverted on a cloth.",
    ],
    composition: "Lead-free crystal",
    origin: "Made in Bohemia, Czech Republic",
    category: "maison",
    collections: ["the-obsidian-edit"],
    price: 96000,
    colors: ["noir", "smoke"],
    rating: 4.7,
    publishedAt: "2025-12-01",
  },
  {
    slug: "atelier-candle",
    name: "Atelier Candle",
    tagline: "Vetiver, cedar and cold stone",
    excerpt:
      "A hand-poured candle in a refillable smoked glass vessel. Sixty hours.",
    description:
      "Poured in two stages so the wax cools evenly and does not tunnel. The vessel is the same smoked crystal as the decanter, and refills are available so it need never be thrown away.",
    story:
      "The scent is what the workshop smells like in February — cut cedar, damp stone, and the vetiver root we keep in the drying room.",
    details: [
      "Vegetable wax blend, cotton wick",
      "Vetiver, cedarwood, ambrette and flint",
      "60-hour burn time, 280g",
      "Refillable smoked glass vessel",
    ],
    care: [
      "Trim the wick to 5mm before each burn.",
      "First burn: allow the pool to reach the edge.",
    ],
    composition: "Vegetable wax; parfum; cotton wick",
    origin: "Poured in Grasse, France",
    category: "maison",
    collections: ["hands-of-the-maison"],
    price: 14000,
    colors: ["forest", "noir"],
    rating: 4.6,
    flags: ["new"],
    publishedAt: "2026-03-18",
  },

  /* ------------------------------------------------------- electronics */
  {
    slug: "auriga-headphones",
    name: "Auriga Over-Ear",
    tagline: "Open-back, and honest about it",
    excerpt:
      "Open-back headphones with hand-matched drivers, machined aluminium yokes and lambskin pads.",
    description:
      "Open-back drivers do not trap pressure behind the diaphragm, which is why they sound like a room rather than a box. The trade is isolation: everyone near you hears them too. That is the correct compromise for listening at home and the wrong one on a train, and we would rather be good at one thing.",
    story:
      "Drivers are matched in pairs by ear before assembly. Roughly one in six is rejected — not because it is faulty, but because it does not have a twin close enough to it. Channel matching within 0.5dB is what makes a centre image sit precisely between your ears instead of drifting.",
    details: [
      "50mm open-back dynamic drivers, hand-matched in pairs",
      "Machined aluminium yokes, magnesium baffles",
      "Lambskin memory-foam pads, user-replaceable",
      "32Ω — runs from a phone, better from an amplifier",
      "2m detachable OFC cable, 3.5mm with 6.35mm adapter",
      "320g without cable",
    ],
    care: [
      "Store on a stand, away from direct sunlight.",
      "Replace pads every 18–24 months for consistent seal.",
      "Never submerge; wipe with a barely damp cloth.",
    ],
    composition: "Aluminium; magnesium; lambskin; OFC copper",
    origin: "Assembled in Shenzhen, China",
    category: "electronics",
    collections: ["the-obsidian-edit", "hands-of-the-maison"],
    price: 128000,
    colors: ["noir", "silver", "graphite"],
    rating: 4.8,
    flags: ["new"],
    featured: true,
    publishedAt: "2026-05-14",
  },
  {
    slug: "sonus-table-speaker",
    name: "Sonus Table Speaker",
    tagline: "One box, placed once, left alone",
    excerpt:
      "A sealed-cabinet table speaker in solid walnut, with a paper-cone mid and a soft-dome tweeter.",
    description:
      "A sealed cabinet gives less bass than a ported one and better bass than a ported one — tighter, faster, and without the one-note bloom that ports produce near a wall. The cabinet is solid walnut rather than veneered MDF, braced internally so the panels do not sing along with the driver.",
    story:
      "Paper is still the best cone material anyone has found for midrange. It is light, self-damping, and it fails gracefully. Every synthetic that replaced it trades one of those three away.",
    details: [
      "Sealed solid-walnut cabinet, internally braced",
      "100mm treated paper mid-woofer, 25mm silk-dome tweeter",
      "60W class-AB amplification",
      "Wi-Fi, Bluetooth 5.3, optical and 3.5mm inputs",
      "Machined aluminium volume dial",
      "260 × 160 × 180 mm, 4.2kg",
    ],
    care: [
      "Keep at least 8cm from a rear wall.",
      "Dust the cabinet with a dry cloth; no polish or solvent.",
    ],
    composition: "Solid walnut; aluminium; silk; treated paper",
    origin: "Made in Jutland, Denmark",
    category: "electronics",
    collections: ["hands-of-the-maison"],
    price: 96000,
    compareAtPrice: 112000,
    colors: ["graphite", "cognac", "ivory"],
    rating: 4.7,
    flags: ["new"],
    publishedAt: "2026-04-29",
  },
  {
    slug: "revolve-turntable",
    name: "Revolve Turntable",
    tagline: "Belt-driven, on a plinth that refuses to resonate",
    excerpt:
      "A belt-drive turntable with a carbon tonearm, machined aluminium platter and a factory-aligned cartridge.",
    description:
      "Belt drive isolates the platter from motor vibration in a way direct drive cannot, at the cost of slightly slower start-up — irrelevant outside a DJ booth. The platter is machined aluminium with a damping ring, and the plinth is a constrained-layer sandwich that turns cabinet resonance into heat instead of sound.",
    story:
      "The cartridge is aligned on a jig at the bench and the arm balanced before it ships, so it plays properly out of the box. Most turntables at this price do not, and most owners never find out what they were missing.",
    details: [
      "Belt drive, 33⅓ and 45 rpm, electronic speed change",
      "Carbon-fibre tonearm with adjustable counterweight",
      "Machined aluminium platter with damping ring",
      "Moving-magnet cartridge, aligned at the bench",
      "Built-in switchable phono stage",
      "Dust cover and felt mat included",
    ],
    care: [
      "Replace the stylus every 800–1,000 hours.",
      "Keep the belt free of dust; replace every two years.",
      "Level the plinth on installation.",
    ],
    composition: "Aluminium; carbon fibre; MDF-constrained layer plinth",
    origin: "Made in Litoměřice, Czech Republic",
    category: "electronics",
    collections: ["the-atelier-series"],
    price: 174000,
    colors: ["noir", "cognac"],
    rating: 4.9,
    flags: ["limited"],
    publishedAt: "2026-06-02",
  },
  {
    slug: "aria-earphones",
    name: "Aria Wireless Earphones",
    tagline: "Tuned flat, then nudged once",
    excerpt:
      "In-ear wireless with adaptive noise cancellation, a machined case and eight hours to a charge.",
    description:
      "Most wireless earphones are tuned with a large bass shelf because it demonstrates well in a shop. Aria is tuned close to flat and then lifted very slightly below 100Hz — enough to feel a double bass, not enough to smear a cello. It is a quieter first impression and a better hundredth one.",
    story:
      "The case is machined from a single aluminium billet rather than moulded, so the lid hinge sits in metal and does not develop play. It is the part you touch most and the part almost nobody spends money on.",
    details: [
      "10mm dynamic drivers, adaptive noise cancellation",
      "8 hours per charge, 32 hours with the case",
      "Machined aluminium charging case, USB-C and Qi",
      "Bluetooth 5.3, multipoint pairing, LDAC",
      "IPX4 — safe for rain and exertion",
      "Four silicone and two foam tip sizes included",
    ],
    care: [
      "Wipe the nozzles weekly; replace tips every six months.",
      "Store in the case — the battery prefers it.",
    ],
    composition: "Aluminium; medical-grade silicone",
    origin: "Assembled in Shenzhen, China",
    category: "electronics",
    collections: [],
    price: 38000,
    colors: ["ivory", "noir", "champagne"],
    rating: 4.5,
    flags: ["new"],
    publishedAt: "2026-06-20",
  },

  /* -------------------------------------------------------------- hair */
  {
    slug: "seruma-hair-oil",
    name: "Seruma Hair Oil",
    tagline: "Four oils, cold-pressed, nothing else",
    excerpt:
      "A weightless finishing oil of camellia, marula, argan and jojoba. No silicone, no fragrance.",
    description:
      "Silicone makes hair feel smooth immediately and builds up until it looks dull. This is four cold-pressed oils and nothing else — camellia for slip, marula for shine, argan for repair, jojoba because it is closest to what the scalp already makes. Two drops is a full application on mid-length hair.",
    story:
      "Cold pressing yields around a third of what heat extraction does from the same seed, and keeps the fatty acids intact. It is the reason a bottle this size costs what it does.",
    details: [
      "Camellia, marula, argan and jojoba oils",
      "No silicone, sulphate, fragrance or added water",
      "Safe on colour-treated and chemically relaxed hair",
      "Glass bottle with a metered dropper",
      "50ml — approximately four months of use",
    ],
    care: [
      "Apply to damp mid-lengths and ends, never the scalp.",
      "Store away from direct light; the oils oxidise.",
    ],
    composition:
      "Camellia oleifera, Sclerocarya birrea, Argania spinosa, Simmondsia chinensis",
    origin: "Blended in Seoul, South Korea",
    category: "hair",
    collections: ["savoir-faire"],
    price: 9800,
    colors: ["champagne"],
    sizeLabel: "Volume",
    sizes: ["30ml", "50ml", "100ml"],
    rating: 4.8,
    flags: ["new"],
    featured: true,
    publishedAt: "2026-05-28",
  },
  {
    slug: "crin-bristle-brush",
    name: "Crin Bristle Brush",
    tagline: "Boar bristle, set by hand into pear wood",
    excerpt:
      "A hand-drawn boar-bristle brush on a pear-wood body, with a cushioned rubber pad.",
    description:
      "Boar bristle carries the scalp's own oil down the shaft, which is what makes hair shine without product. Each tuft is drawn into the cushion by hand — a machine can set a brush in seconds, but it cannot vary tuft density across the pad, and that variation is what keeps the brush from dragging at the crown.",
    story:
      "Pear wood is used because it is dense, close-grained and takes an oil finish without raising. It is the same timber used for drawing instruments, for the same reasons.",
    details: [
      "First-cut boar bristle, hand-drawn in 11 rows",
      "Pear-wood body, oil-finished",
      "Natural rubber cushion pad",
      "Suitable for fine to medium hair",
      "220mm overall",
    ],
    care: [
      "Remove shed hair after each use with a brush cleaner.",
      "Wash monthly in tepid water; dry bristles-down.",
      "Never soak the wooden body.",
    ],
    composition: "Boar bristle; pear wood; natural rubber",
    origin: "Made in the Black Forest, Germany",
    category: "hair",
    collections: ["hands-of-the-maison"],
    price: 14500,
    colors: ["cognac", "noir"],
    rating: 4.7,
    publishedAt: "2026-04-08",
  },
  {
    slug: "lavande-hair-ritual",
    name: "Lavande Hair Ritual",
    tagline: "Shampoo and conditioner, made in 400-litre batches",
    excerpt:
      "A sulphate-free duo scented with true lavender absolute, made in small batches and dated on the base.",
    description:
      "Sulphates clean well and strip colour doing it. This uses a coco-glucoside system that lathers less and leaves the cuticle intact — expect a modest foam and hair that holds its colour three to four weeks longer. The conditioner is a true emulsion, not a silicone film, so it rinses fully.",
    story:
      "Batches are 400 litres and are dated on the base. Nothing sits in a warehouse for two years, which matters because the lavender absolute is the first thing to fade.",
    details: [
      "Sulphate-free coco-glucoside cleansing system",
      "True lavender absolute, no synthetic fragrance",
      "Colour-safe; suitable for weekly to daily use",
      "Recyclable aluminium bottles",
      "300ml each, supplied as a pair",
    ],
    care: [
      "Use within twelve months of the date on the base.",
      "Store out of direct sunlight.",
    ],
    composition: "Aqua, coco-glucoside, glycerin, Lavandula angustifolia",
    origin: "Made in Provence, France",
    category: "hair",
    collections: [],
    price: 7200,
    compareAtPrice: 8600,
    colors: ["forest", "ivory"],
    rating: 4.6,
    flags: ["new"],
    publishedAt: "2026-06-11",
  },

  /* ---------------------------------------------------- more footwear */
  {
    slug: "cirrus-low-sneaker",
    name: "Cirrus Low Sneaker",
    tagline: "Cup-soled, and resoleable — which is rare",
    excerpt:
      "A minimal low sneaker in full-grain calf, on a cup sole that can actually be replaced.",
    description:
      "Almost every luxury sneaker is glued shut and disposable. Cirrus is cup-soled with a stitched throat, so a cobbler can take the sole off and put a new one on. It costs more to build and it is the only version of this shoe worth making.",
    story:
      "The upper is one piece of calf across the vamp and quarters, so there is no seam where the foot flexes. It uses more hide and it is the reason the shoe does not crease into a hard ridge after a season.",
    details: [
      "Full-grain calfskin upper, single-piece vamp",
      "Stitched cup sole — resoleable by any cobbler",
      "Vegetable-tanned leather lining and insole",
      "Cotton laces, spare pair included",
      "Available in half sizes",
    ],
    care: [
      "Use cedar trees between wears.",
      "Clean with saddle soap; condition twice a year.",
    ],
    composition: "Calfskin upper; vegetable-tanned lining; rubber cup sole",
    origin: "Made in Bình Dương, Vietnam",
    category: "footwear",
    collections: ["hands-of-the-maison"],
    price: 92000,
    colors: ["ivory", "noir", "taupe"],
    sizeLabel: "Size",
    sizes: ["38", "39", "40", "41", "42", "43", "44", "45"],
    rating: 4.6,
    flags: ["new"],
    publishedAt: "2026-05-05",
  },
  {
    slug: "brecon-chelsea-boot",
    name: "Brecon Chelsea Boot",
    tagline: "Goodyear-welted, for thirty winters",
    excerpt:
      "A Goodyear-welted Chelsea boot in waxed calf, on a Dainite sole with a storm welt.",
    description:
      "Goodyear welting stitches the upper to a welt and the welt to the sole, so the shoe can be resoled repeatedly without ever disturbing the upper. A storm welt adds a raised lip that keeps water out of the join. Together they are the reason a boot like this is still going after thirty winters and four soles.",
    story:
      "Waxed calf is hot-stuffed with wax and tallow while the hide is still warm, which drives it into the fibre rather than sitting on top. It dulls slightly in rain and comes back with a brush.",
    details: [
      "Hot-stuffed waxed calfskin upper",
      "Goodyear welted with a storm welt",
      "Dainite studded rubber sole",
      "Twin elastic gussets, leather pull tab",
      "Leather-lined throughout",
      "Available in half sizes",
    ],
    care: [
      "Use trees; allow 24 hours between wears.",
      "Brush after wear; wax polish every fifth wear.",
      "Resole before the welt stitching is reached.",
    ],
    composition: "Waxed calfskin; leather lining; Dainite rubber sole",
    origin: "Made in Northampton, England",
    category: "footwear",
    collections: ["winter-solstice", "the-atelier-series"],
    price: 138000,
    colors: ["graphite", "cognac", "noir"],
    sizeLabel: "Size",
    sizes: ["39", "40", "41", "42", "43", "44", "45", "46"],
    rating: 4.9,
    featured: true,
    publishedAt: "2026-04-17",
  },
];

/* ------------------------------------------------------------ expansion */

function buildImages(seed: Seed): ProductImage[] {
  const captions = [
    `${seed.name} — front view`,
    `${seed.name} — detail`,
    `${seed.name} — in context`,
  ];
  return [0, 1, 2].map((i) => ({
    id: `${seed.slug}-img-${i + 1}`,
    url: `/media/products/${seed.slug}-${i + 1}.jpg`,
    alt: captions[i],
    width: 1200,
    height: 1600,
    position: i,
  }));
}

function buildOptions(seed: Seed): ProductOption[] {
  const colorValues: ProductOptionValue[] = seed.colors.map((key) => ({
    value: key,
    label: SWATCH[key][0],
    hex: SWATCH[key][1],
    available: true,
  }));

  const options: ProductOption[] = [
    {
      id: `${seed.slug}-opt-colour`,
      name: "Colour",
      type: "color",
      values: colorValues,
    },
  ];

  if (seed.sizes?.length) {
    options.push({
      id: `${seed.slug}-opt-size`,
      name: seed.sizeLabel ?? "Size",
      type: "size",
      values: seed.sizes.map((size) => ({
        value: size,
        label: size,
        available: true,
      })),
    });
  }

  return options;
}

/**
 * SKU prefix.
 *
 * Three letters of the slug is not enough to identify a product: both
 * `aurelia-top-handle` and `auriga-headphones` reduce to AUR, which silently
 * produced three duplicate SKUs. Nothing caught it here — the collision only
 * surfaced when the seed script upserted `product_variants` on `sku` and
 * Postgres rejected the entire batch with "ON CONFLICT DO UPDATE command cannot
 * affect row a second time", which names neither the table nor the value.
 *
 * Appending a hash of the *full* slug keeps the prefix short and readable while
 * making it depend on the whole name. Stable across re-seeds because it derives
 * from the slug, which is itself the natural key.
 */
function skuPrefix(slug: string) {
  const letters = slug.slice(0, 3).toUpperCase();
  const discriminator = (hash(slug) % 36 ** 3)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `ZY-${letters}${discriminator}`;
}

function buildVariants(seed: Seed, images: ProductImage[]): ProductVariant[] {
  const sizes = seed.sizes ?? [null];
  const sizeName = seed.sizeLabel ?? "Size";
  const variants: ProductVariant[] = [];

  seed.colors.forEach((colorKey, colorIndex) => {
    sizes.forEach((size, sizeIndex) => {
      const index = variants.length;
      const id = `${seed.slug}-v${index + 1}`;
      const forcedOut = seed.soldOut?.includes(index) ?? false;
      // ~8% of variants run out naturally, on top of the curated ones.
      const stock = forcedOut ? 0 : seededInt(id, 0, 12);

      const selectedOptions: Record<string, string> = {
        Colour: colorKey,
      };
      if (size) selectedOptions[sizeName] = size;

      variants.push({
        id,
        sku: `${skuPrefix(seed.slug)}-${String(colorIndex + 1).padStart(
          2,
          "0"
        )}${String(sizeIndex + 1).padStart(2, "0")}`,
        title: size
          ? `${SWATCH[colorKey][0]} / ${size}`
          : SWATCH[colorKey][0],
        selectedOptions,
        price: seed.price,
        compareAtPrice: seed.compareAtPrice ?? null,
        inventoryQuantity: stock,
        available: stock > 0,
        imageId: images[Math.min(colorIndex, images.length - 1)]?.id ?? null,
      });
    });
  });

  return variants;
}

/** Marks option values that have no purchasable variant behind them. */
function reconcileAvailability(
  options: ProductOption[],
  variants: ProductVariant[]
) {
  for (const option of options) {
    for (const value of option.values) {
      value.available = variants.some(
        (v) => v.selectedOptions[option.name] === value.value && v.available
      );
    }
  }
}

function buildProduct(seed: Seed): Product {
  const images = buildImages(seed);
  const options = buildOptions(seed);
  const variants = buildVariants(seed, images);
  const origin = parseOrigin(seed.origin);
  reconcileAvailability(options, variants);

  const flags = [...(seed.flags ?? [])];
  const publishedMs = new Date(seed.publishedAt).getTime();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  if (
    !flags.includes("new") &&
    Date.now() - publishedMs < ninetyDays &&
    publishedMs <= Date.now()
  ) {
    flags.unshift("new");
  }

  return {
    id: `prod-${seed.slug}`,
    slug: seed.slug,
    name: seed.name,
    tagline: seed.tagline,
    excerpt: seed.excerpt,
    description: seed.description,
    story: seed.story,
    details: seed.details,
    care: seed.care,
    composition: seed.composition,
    origin: seed.origin,
    originCountry: origin.country,
    originCity: origin.city,
    categorySlug: seed.category,
    collectionSlugs: seed.collections,
    price: seed.price,
    compareAtPrice: seed.compareAtPrice ?? null,
    currency: CURRENCY,
    images,
    options,
    variants,
    rating: seed.rating,
    reviewCount: seededInt(`${seed.slug}-reviews`, 14, 268),
    flags,
    isFeatured: seed.featured ?? false,
    available: variants.some((v) => v.available),
    publishedAt: new Date(seed.publishedAt).toISOString(),
  };
}

export const PRODUCTS: Product[] = SEEDS.map(buildProduct);

/* --------------------------------------------------------------- journal */

export const JOURNAL: EditorialArticle[] = [
  {
    slug: "cutting-the-first-hide",
    title: "Cutting the First Hide",
    kicker: "Inside the workshop",
    excerpt:
      "Why a third of every skin ends up on the floor, and why we would not have it otherwise.",
    body: [
      "A hide is not a rectangle. It has a spine, a belly, two shoulders and four legs, and the leather behaves differently in each. The spine is dense and holds a fold; the belly is loose and will stretch out of shape within a season. A cutter's first job is to read the skin — by hand, in raking light — and decide what it can honestly become.",
      "On the Aurelia we cut the body from a single panel so the grain runs unbroken around the corners. That constraint alone rules out most of the hide. What remains goes to small goods, and what cannot be used at all goes back to the tannery.",
      "There is a faster way to do this. You cut the body in four pieces, seam the corners, and get three bags from a skin instead of one. It is not visibly worse for about two years. Then the seams begin to show at the corners, which is precisely where a bag takes its wear.",
    ],
    image: {
      id: "j-hide",
      url: "/media/journal/cutting-the-first-hide.jpg",
      alt: "Cutting the first hide",
      width: 1800,
      height: 1200,
      position: 0,
    },
    readingMinutes: 6,
    publishedAt: "2026-03-12",
    author: "Hélène Marchand",
  },
  {
    slug: "six-hundred-hours",
    title: "Six Hundred Hours",
    kicker: "Timepieces",
    excerpt:
      "What actually happens between a finished movement and a watch you can buy.",
    body: [
      "A chronograph calibre leaves the movement house running. It does not leave it finished. Between that point and the sales floor sit roughly six hundred hours of work, most of which is invisible once the caseback is on.",
      "Bridges are chamfered by hand at forty-five degrees and polished with boxwood and diamantine paste. Screw heads are blued in a bath of hot brass filings, one at a time, watched by eye — a few seconds too long and the colour goes past blue into grey and the screw is scrapped.",
      "Then the watch is regulated in five positions over the course of a week, with forty-eight hours of rest between readings so the oils settle. You cannot compress this. It is the reason mechanical watches cost what they do, and the reason they still work in eighty years.",
    ],
    image: {
      id: "j-hours",
      url: "/media/journal/six-hundred-hours.jpg",
      alt: "Six hundred hours at the bench",
      width: 1800,
      height: 1200,
      position: 0,
    },
    readingMinutes: 8,
    publishedAt: "2026-02-19",
    author: "Anton Reyes",
  },
  {
    slug: "the-language-of-gold",
    title: "The Language of Gold",
    kicker: "Fine jewellery",
    excerpt:
      "Carved versus cast, hallmarks worth reading, and why weight is the honest signal.",
    body: [
      "Two rings can look identical in a photograph and differ by a factor of two in the hand. One is cast — molten gold poured into a mould, quick and cheap and slightly porous. The other is carved from solid billet, which wastes material and takes hours, and comes out dense enough to ring when you tap it.",
      "The hallmark tells you the fineness but not the method. Weight tells you the method. A carved signet in 18-carat will sit at around fourteen grams for a mid-size band; a cast one of the same silhouette will come in nearer eight.",
      "Neither is dishonest. But only one of them can be re-polished repeatedly across a lifetime without going thin at the shoulders.",
    ],
    image: {
      id: "j-gold",
      url: "/media/journal/the-language-of-gold.jpg",
      alt: "The language of gold",
      width: 1800,
      height: 1200,
      position: 0,
    },
    readingMinutes: 5,
    publishedAt: "2026-01-30",
    author: "Priya Raghunathan",
  },
  {
    slug: "notes-on-vetiver",
    title: "Notes on Vetiver",
    kicker: "Fragrance",
    excerpt:
      "A root that smells of soil, smoke and citrus depending entirely on where it grew.",
    body: [
      "Vetiver is a grass, and the part used in perfumery is the root — a dense tangle that grows two metres down and takes eighteen months to be worth harvesting. Haitian vetiver is bright and almost grapefruit-like. Javanese is smoky and tarred. Bourbon, from Réunion, sits between them and is the most expensive by a wide margin.",
      "Because the material is so variable, a house's vetiver is a signature in a way that its bergamot never is. We buy Haitian for the top of Fleur de Sel and Javanese for the base of Noir Absolu, and they do not smell like the same plant.",
      "The root is steam-distilled for twenty-four hours. Everything before that — growing, washing, drying, chopping — takes closer to two years.",
    ],
    image: {
      id: "j-vetiver",
      url: "/media/journal/notes-on-vetiver.jpg",
      alt: "Notes on vetiver",
      width: 1800,
      height: 1200,
      position: 0,
    },
    readingMinutes: 4,
    publishedAt: "2026-01-14",
    author: "Camille Doré",
  },
  {
    slug: "a-coat-for-a-decade",
    title: "A Coat for a Decade",
    kicker: "Ready-to-wear",
    excerpt:
      "Canvassed versus fused, why lining fails first, and how to buy outerwear once.",
    body: [
      "Most tailored outerwear is fused: the outer cloth is glued to an interfacing. It is fast, cheap and consistent, and it is why so many coats develop bubbles across the chest after a few dry cleans. A canvassed coat is stitched instead of glued, and it moulds to the wearer over a season rather than resisting them.",
      "The double-faced cashmere coat avoids the question entirely by having no lining and no interfacing at all. Two cloths are woven as one, split by hand at the seam allowance, and closed invisibly. There is nothing inside to fail.",
      "Thirty hours of hand-sewing per coat. It is the most expensive way to make outerwear and the only one where the garment's lifespan is set by the fibre rather than by the construction.",
    ],
    image: {
      id: "j-coat",
      url: "/media/journal/a-coat-for-a-decade.jpg",
      alt: "A coat for a decade",
      width: 1800,
      height: 1200,
      position: 0,
    },
    readingMinutes: 7,
    publishedAt: "2025-12-08",
    author: "Hélène Marchand",
  },
  {
    slug: "the-quiet-house",
    title: "The Quiet House",
    kicker: "Maison",
    excerpt:
      "Objects that ask nothing of a room, and are noticed anyway.",
    body: [
      "There is a difference between a room that has been decorated and a room that has been furnished. The first announces its choices. The second lets you find them.",
      "Mouth-blown glass has small asymmetries that catch light unevenly — you register the object before you notice why. A machine-pressed decanter of the same shape is perfectly regular and, for that reason, invisible.",
      "We make very few objects for the home, and all of them are refillable, resealable or repairable. An object that cannot be maintained is not a quiet object. It is a temporary one.",
    ],
    image: {
      id: "j-quiet",
      url: "/media/journal/the-quiet-house.jpg",
      alt: "The quiet house",
      width: 1800,
      height: 1200,
      position: 0,
    },
    readingMinutes: 4,
    publishedAt: "2025-11-21",
    author: "Jonas Verbeek",
  },
];

/* Shipping rates, promotions and tax live in `@/data/commerce`, and are not
 * re-exported here. Importing them through this module would drag the whole
 * PRODUCTS array into any bundle that only wanted a shipping rate — which is
 * the reason they were split out in the first place. Nothing imports them
 * from here any more. */
