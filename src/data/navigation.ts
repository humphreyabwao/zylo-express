export interface NavLink {
  label: string;
  href: string;
  description?: string;
}

export interface NavColumn {
  heading: string;
  links: NavLink[];
}

export interface NavFeature {
  eyebrow: string;
  title: string;
  href: string;
  image: string;
  imageAlt: string;
}

export interface NavItem {
  label: string;
  href: string;
  /** Present when the item opens a mega-menu. */
  columns?: NavColumn[];
  features?: NavFeature[];
}

export const MAIN_NAV: NavItem[] = [
  {
    label: "New In",
    href: "/collections/new-in",
  },
  {
    label: "Leather Goods",
    href: "/category/leather-goods",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "All Leather Goods", href: "/category/leather-goods" },
          { label: "Top-Handle", href: "/category/leather-goods?q=top-handle" },
          { label: "Shoulder Bags", href: "/category/leather-goods?q=shoulder" },
          { label: "Clutches", href: "/category/leather-goods?q=clutch" },
          { label: "Travel", href: "/category/leather-goods?q=weekender" },
        ],
      },
      {
        heading: "Edits",
        links: [
          { label: "The Obsidian Edit", href: "/collections/the-obsidian-edit" },
          { label: "Hands of the Maison", href: "/collections/hands-of-the-maison" },
          { label: "The Atelier Series", href: "/collections/the-atelier-series" },
        ],
      },
      {
        heading: "Services",
        links: [
          { label: "Monogramming", href: "/services#monogramming" },
          { label: "Repair & Restoration", href: "/services#repair" },
          { label: "Leather Care", href: "/services#care" },
        ],
      },
    ],
    features: [
      {
        eyebrow: "Icon",
        title: "The Aurelia, cut on the original pattern",
        href: "/products/aurelia-top-handle",
        image: "/media/collections/leather-goods.jpg",
        imageAlt: "Aurelia Top-Handle",
      },
    ],
  },
  {
    label: "Timepieces",
    href: "/category/timepieces",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "All Timepieces", href: "/category/timepieces" },
          { label: "Chronographs", href: "/products/meridian-chronograph" },
          { label: "Automatics", href: "/products/solaire-automatic" },
          { label: "Skeleton", href: "/products/nocturne-skeleton" },
        ],
      },
      {
        heading: "The House",
        links: [
          { label: "Six Hundred Hours", href: "/journal/six-hundred-hours" },
          { label: "Servicing", href: "/services#servicing" },
          { label: "Warranty", href: "/help/warranty" },
        ],
      },
    ],
    features: [
      {
        eyebrow: "Limited",
        title: "Nocturne Skeleton — an edition of 150",
        href: "/products/nocturne-skeleton",
        image: "/media/collections/timepieces.jpg",
        imageAlt: "Nocturne Skeleton",
      },
    ],
  },
  {
    label: "Jewellery",
    href: "/category/fine-jewellery",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "All Fine Jewellery", href: "/category/fine-jewellery" },
          { label: "Rings", href: "/products/lumiere-signet-ring" },
          { label: "Necklaces", href: "/products/astra-pendant" },
          { label: "Cuffs & Bracelets", href: "/products/velours-cuff" },
        ],
      },
      {
        heading: "Edits",
        links: [
          { label: "Gold Standard", href: "/collections/gold-standard" },
          { label: "Savoir-Faire", href: "/collections/savoir-faire" },
        ],
      },
    ],
    features: [
      {
        eyebrow: "Made to order",
        title: "Lumière Signet, carved and hand-engraved",
        href: "/products/lumiere-signet-ring",
        image: "/media/collections/fine-jewellery.jpg",
        imageAlt: "Lumière Signet",
      },
    ],
  },
  {
    label: "Ready-to-Wear",
    href: "/category/ready-to-wear",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "All Ready-to-Wear", href: "/category/ready-to-wear" },
          { label: "Coats", href: "/products/cashmere-longline-coat" },
          { label: "Trenches", href: "/products/belvoir-trench" },
          { label: "Shearling", href: "/products/alpine-shearling" },
        ],
      },
      {
        heading: "Also",
        links: [
          { label: "Footwear", href: "/category/footwear" },
          { label: "Eyewear", href: "/category/eyewear" },
          { label: "Silk", href: "/products/carre-silk-scarf" },
        ],
      },
    ],
    features: [
      {
        eyebrow: "Winter Solstice",
        title: "Double-faced cashmere, closed by hand",
        href: "/collections/winter-solstice",
        image: "/media/collections/ready-to-wear.jpg",
        imageAlt: "Longline cashmere coat",
      },
    ],
  },
  {
    label: "Shoes",
    href: "/category/footwear",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "All Footwear", href: "/category/footwear" },
          { label: "Sneakers", href: "/products/cirrus-low-sneaker" },
          { label: "Boots", href: "/products/brecon-chelsea-boot" },
          { label: "Loafers", href: "/products/monceau-loafer" },
          { label: "Heels", href: "/products/duchesse-heel" },
        ],
      },
      {
        heading: "Services",
        links: [
          { label: "Resoling & Repair", href: "/services#repair" },
          { label: "Fit Guide", href: "/help/sizing" },
        ],
      },
    ],
    features: [
      {
        eyebrow: "New",
        title: "Cirrus — cup-soled, and actually resoleable",
        href: "/products/cirrus-low-sneaker",
        image: "/media/collections/footwear.jpg",
        imageAlt: "Cirrus Low Sneaker",
      },
    ],
  },
  {
    label: "Electronics",
    href: "/category/electronics",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "All Sound & Electronics", href: "/category/electronics" },
          { label: "Headphones", href: "/products/auriga-headphones" },
          { label: "Earphones", href: "/products/aria-earphones" },
          { label: "Speakers", href: "/products/sonus-table-speaker" },
          { label: "Turntables", href: "/products/revolve-turntable" },
        ],
      },
      {
        heading: "The House",
        links: [
          { label: "Warranty", href: "/help/warranty" },
          { label: "Servicing", href: "/services#servicing" },
        ],
      },
    ],
    features: [
      {
        eyebrow: "New",
        title: "Auriga — open-back, and honest about it",
        href: "/products/auriga-headphones",
        image: "/media/collections/electronics.jpg",
        imageAlt: "Auriga Over-Ear headphones",
      },
    ],
  },
  {
    label: "Beauty",
    href: "/category/hair",
    columns: [
      {
        heading: "Hair",
        links: [
          { label: "All Hair", href: "/category/hair" },
          { label: "Oils & Serums", href: "/products/seruma-hair-oil" },
          { label: "Brushes", href: "/products/crin-bristle-brush" },
          { label: "Wash & Care", href: "/products/lavande-hair-ritual" },
        ],
      },
      {
        heading: "Fragrance",
        links: [
          { label: "All Fragrance", href: "/category/fragrance" },
          { label: "Marceau", href: "/products/marceau-eau-de-parfum" },
          { label: "Noir Absolu", href: "/products/noir-absolu" },
          { label: "Fleur de Sel", href: "/products/fleur-de-sel" },
        ],
      },
    ],
    features: [
      {
        eyebrow: "New",
        title: "Seruma — four oils, cold-pressed, nothing else",
        href: "/products/seruma-hair-oil",
        image: "/media/collections/hair.jpg",
        imageAlt: "Seruma Hair Oil",
      },
    ],
  },
  {
    label: "Maison",
    href: "/category/maison",
  },
  {
    label: "Journal",
    href: "/journal",
  },
];

export const FOOTER_NAV: NavColumn[] = [
  {
    heading: "Client Services",
    links: [
      { label: "Contact Us", href: "/help/contact" },
      { label: "Shipping & Delivery", href: "/help/shipping" },
      { label: "Returns & Exchanges", href: "/help/returns" },
      { label: "Order Tracking", href: "/account/orders" },
      { label: "Payment & Financing", href: "/help/payment" },
      { label: "FAQ", href: "/help" },
    ],
  },
  {
    heading: "The Maison",
    links: [
      { label: "Our Story", href: "/about" },
      { label: "Savoir-Faire", href: "/about#savoir-faire" },
      { label: "Sustainability", href: "/about#sustainability" },
      { label: "The Journal", href: "/journal" },
      { label: "Careers", href: "/about#careers" },
    ],
  },
  {
    heading: "Services",
    links: [
      { label: "Book an Appointment", href: "/services#appointments" },
      { label: "Monogramming", href: "/services#monogramming" },
      { label: "Repair & Restoration", href: "/services#repair" },
      { label: "Watch Servicing", href: "/services#servicing" },
      { label: "Gift Wrapping", href: "/services#gifting" },
    ],
  },
  {
    heading: "Boutiques",
    links: [
      { label: "Paris — Rue Saint-Honoré", href: "/boutiques" },
      { label: "London — Mount Street", href: "/boutiques" },
      { label: "New York — Madison Avenue", href: "/boutiques" },
      { label: "Tokyo — Ginza", href: "/boutiques" },
      { label: "All Boutiques", href: "/boutiques" },
    ],
  },
];

export const LEGAL_NAV: NavLink[] = [
  { label: "Privacy Policy", href: "/legal/privacy" },
  { label: "Terms of Sale", href: "/legal/terms" },
  { label: "Cookie Preferences", href: "/legal/cookies" },
  { label: "Accessibility", href: "/legal/accessibility" },
];

export const ANNOUNCEMENTS = [
  "Complimentary insured delivery on all orders",
  "Hand-finished in our European ateliers",
  "Book a private appointment in any boutique",
  "Extended returns through the season",
];
