export interface ContentSection {
  heading: string;
  body: string[];
  /** Rendered as a hairline-separated definition list. */
  facts?: { term: string; detail: string }[];
}

export interface ContentPage {
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  updated: string;
  sections: ContentSection[];
}

/* ------------------------------------------------------- client services */

export const HELP_PAGES: ContentPage[] = [
  {
    slug: "shipping",
    title: "Shipping & Delivery",
    eyebrow: "Client services",
    summary:
      "Every order is insured in transit and requires a signature on arrival. Delivery is complimentary above $500.",
    updated: "2026-06-01",
    sections: [
      {
        heading: "Services and timing",
        body: [
          "Orders placed before 12:00 local time are dispatched the same working day, except for made-to-order pieces, which are dispatched when the atelier releases them.",
        ],
        facts: [
          {
            term: "Complimentary Delivery",
            detail: "3–5 business days. Free above $500, otherwise $25.",
          },
          {
            term: "Express",
            detail: "1–2 business days. $35, priority handling and insurance.",
          },
          {
            term: "Same-Day Courier",
            detail:
              "Selected metropolitan areas, ordered before 12:00. $95, delivered before 20:00.",
          },
        ],
      },
      {
        heading: "Made to order",
        body: [
          "Engraved signets, monogrammed leather and the double-faced cashmere coat are made after your order is placed. Lead times are stated on each product page and confirmed by your client advisor.",
          "You will receive a message when the piece leaves the atelier, not when the order is taken.",
        ],
      },
      {
        heading: "Duties and customs",
        body: [
          "Prices shown include duties for delivery within the United States, the United Kingdom and the European Union. For other destinations, duties are calculated at checkout and paid at the point of sale, never on the doorstep.",
        ],
      },
      {
        heading: "Signature on delivery",
        body: [
          "Every parcel requires a signature. If nobody is available, the courier will attempt delivery twice more before returning the parcel to us, and we will contact you to arrange a new date.",
        ],
      },
    ],
  },
  {
    slug: "returns",
    title: "Returns & Exchanges",
    eyebrow: "Client services",
    summary:
      "Unworn pieces may be returned within thirty days. Collection is arranged by us at no charge.",
    updated: "2026-06-01",
    sections: [
      {
        heading: "The policy",
        body: [
          "You have thirty days from delivery to return a piece that is unworn, unaltered and in its original packaging with all tags and documentation. Fragrance must be unopened and its seal intact.",
          "Request a return from your account or through a client advisor. We arrange collection and send a prepaid, insured label. Refunds are issued to the original payment method within five business days of the piece reaching the workshop.",
        ],
      },
      {
        heading: "What cannot be returned",
        body: [
          "Made-to-order pieces, hand-engraved jewellery, monogrammed leather goods, opened fragrance and pierced earrings are final sale. This is stated on each product page before you order.",
        ],
      },
      {
        heading: "Exchanges",
        body: [
          "Exchanges for a different size or colour are handled as a return and a new order, so the piece you want is reserved immediately rather than after the return arrives.",
        ],
      },
      {
        heading: "If something is wrong",
        body: [
          "A manufacturing fault is our responsibility for the life of the piece, not for thirty days. Contact a client advisor with photographs and we will repair, replace or refund without argument.",
        ],
      },
    ],
  },
  {
    slug: "payment",
    title: "Payment & Financing",
    eyebrow: "Client services",
    summary:
      "All major cards, bank transfer for larger orders, and instalments through our finance partner.",
    updated: "2026-06-01",
    sections: [
      {
        heading: "Accepted methods",
        body: [
          "Visa, Mastercard, American Express, Apple Pay and Google Pay are accepted on all orders. Bank transfer is available for orders above $10,000 — your client advisor will arrange it.",
        ],
      },
      {
        heading: "Security",
        body: [
          "Card details are handled entirely by our payment provider and never touch our systems. We store no card numbers, and no member of staff can retrieve them.",
        ],
      },
      {
        heading: "Instalments",
        body: [
          "Orders between $1,000 and $25,000 may be split across three, six or twelve months through our finance partner, subject to status. The option appears at checkout where eligible.",
        ],
      },
    ],
  },
  {
    slug: "warranty",
    title: "Warranty",
    eyebrow: "Client services",
    summary:
      "Two years on everything, five on timepieces and electronics, and a lifetime on manufacturing faults.",
    updated: "2026-06-01",
    sections: [
      {
        heading: "Cover",
        body: [
          "Every piece carries a two-year warranty against defects in materials and workmanship. Timepieces and electronics carry five years. A manufacturing fault is covered for the life of the piece regardless of these periods.",
        ],
        facts: [
          { term: "Leather goods", detail: "2 years, plus lifetime on faults" },
          { term: "Timepieces", detail: "5 years international" },
          { term: "Electronics", detail: "5 years, drivers and amplification" },
          { term: "Fine jewellery", detail: "2 years, plus lifetime re-polishing" },
        ],
      },
      {
        heading: "What is not covered",
        body: [
          "Normal wear, accidental damage, water damage to non-rated pieces, and work carried out by a third party. Leather that has darkened, suede that has softened and gold that has acquired a patina are not faults — they are the point.",
        ],
      },
    ],
  },
  {
    slug: "sizing",
    title: "Sizing & Fit",
    eyebrow: "Client services",
    summary:
      "Our lasts, ring sizes and ready-to-wear measurements, with the honest notes on where they run true.",
    updated: "2026-06-01",
    sections: [
      {
        heading: "Footwear",
        body: [
          "Our lasts run true to size for most feet, with a slightly narrow waist. If you are between sizes, take the smaller for the loafer — unlined suede will mould within ten wears — and the larger for the boot, which is lined and will not.",
        ],
      },
      {
        heading: "Rings",
        body: [
          "Sizes are European. A signet sits best a half-size larger than a band because it carries more weight on the top of the finger. Complimentary sizing is offered in any boutique before engraving.",
        ],
      },
      {
        heading: "Ready-to-wear",
        body: [
          "Outerwear is cut generously enough to take a jacket underneath. The trench is cut on the 1974 block, which is fuller through the chest than a modern pattern — if you are between sizes, take the smaller.",
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ legal */

export const LEGAL_PAGES: ContentPage[] = [
  {
    slug: "privacy",
    title: "Privacy Policy",
    eyebrow: "Legal",
    summary:
      "What we collect, why we collect it, and how to have it removed.",
    updated: "2026-06-01",
    sections: [
      {
        heading: "What we collect",
        body: [
          "To fulfil an order we collect your name, delivery and billing address, email address and contact number. Payment details are collected by our payment provider and are never stored by us.",
          "If you create an account we retain your order history, saved addresses and saved pieces so you do not have to re-enter them.",
        ],
      },
      {
        heading: "Why we collect it",
        body: [
          "To take, fulfil and deliver your order; to handle returns and warranty claims; to meet our legal and tax obligations; and, only where you have asked us to, to write to you about collections.",
          "We do not sell personal data, and we do not share it with advertisers.",
        ],
      },
      {
        heading: "Cookies",
        body: [
          "Strictly necessary cookies keep your bag and session working and cannot be switched off. Analytics cookies are optional and are off until you accept them.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "You may request a copy of the data we hold, ask for it to be corrected, or ask for it to be erased. Write to privacy@zylo.example and we will respond within thirty days. Order records are retained for the period required by tax law and cannot be erased before then.",
        ],
      },
    ],
  },
  {
    slug: "terms",
    title: "Terms of Sale",
    eyebrow: "Legal",
    summary: "The agreement between you and the house when you place an order.",
    updated: "2026-06-01",
    sections: [
      {
        heading: "Placing an order",
        body: [
          "An order is an offer to buy. The contract is formed when we send the dispatch confirmation, not when payment is taken. If a piece turns out to be unavailable we will cancel and refund in full.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "Prices are shown in the currency selected and include duties for the destinations listed in our shipping policy. If a price is listed in obvious error we will contact you before dispatch and you may cancel.",
        ],
      },
      {
        heading: "Cancellation",
        body: [
          "You may cancel an order before dispatch at no charge. After dispatch, the returns policy applies. Made-to-order pieces may be cancelled within twenty-four hours of ordering, after which the atelier has begun work.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "Nothing in these terms limits liability for death, personal injury or fraud. Otherwise our liability is limited to the value of the order.",
        ],
      },
    ],
  },
  {
    slug: "cookies",
    title: "Cookie Preferences",
    eyebrow: "Legal",
    summary: "What each category does and how to change your mind.",
    updated: "2026-06-01",
    sections: [
      {
        heading: "Categories",
        body: [],
        facts: [
          {
            term: "Strictly necessary",
            detail:
              "Session, bag contents and security. Always on — the site does not work without them.",
          },
          {
            term: "Analytics",
            detail:
              "Aggregate page and product performance. Off until you accept.",
          },
          {
            term: "Preferences",
            detail: "Remembers your country and currency. Off until you accept.",
          },
        ],
      },
      {
        heading: "Changing your mind",
        body: [
          "Your choice is stored for twelve months and can be changed at any time from this page or from the footer of any page.",
        ],
      },
    ],
  },
  {
    slug: "accessibility",
    title: "Accessibility",
    eyebrow: "Legal",
    summary:
      "Our commitment, the standard we work to, and how to tell us where we fall short.",
    updated: "2026-06-01",
    sections: [
      {
        heading: "Our standard",
        body: [
          "We work to WCAG 2.2 Level AA. Every interactive element is reachable by keyboard, focus is always visible, and the interface respects the reduced-motion setting in your operating system.",
        ],
      },
      {
        heading: "Known gaps",
        body: [
          "We publish what is not yet right rather than claiming full conformance. Product imagery on some archive pages lacks descriptive alternative text, and two legacy PDF size guides are not tagged. Both are being corrected.",
        ],
      },
      {
        heading: "Telling us",
        body: [
          "If something on this site prevents you from doing what you came to do, write to accessibility@zylo.example. We aim to reply within two business days and will arrange an alternative way to complete your purchase in the meantime.",
        ],
      },
    ],
  },
];

/* -------------------------------------------------------------- boutiques */

export interface Boutique {
  city: string;
  street: string;
  region: string;
  phone: string;
  hours: string[];
  services: string[];
  image: string;
}

export const BOUTIQUES: Boutique[] = [
  {
    city: "Paris",
    street: "38 Rue Saint-Honoré",
    region: "75001 Paris, France",
    phone: "+33 1 42 60 30 30",
    hours: ["Monday–Saturday 10:00–19:00", "Sunday by appointment"],
    services: ["Full collection", "Engraving", "Leather repair", "Watch servicing"],
    image: "/media/editorial/the-atelier.jpg",
  },
  {
    city: "London",
    street: "44 Mount Street",
    region: "London W1K 2RX, United Kingdom",
    phone: "+44 20 7629 1234",
    hours: ["Monday–Saturday 10:00–18:30", "Sunday 12:00–17:00"],
    services: ["Full collection", "Engraving", "Made-to-order fittings"],
    image: "/media/editorial/a-study-in-black.jpg",
  },
  {
    city: "New York",
    street: "712 Madison Avenue",
    region: "New York, NY 10065, United States",
    phone: "+1 212 555 0180",
    hours: ["Monday–Saturday 10:00–19:00", "Sunday 12:00–18:00"],
    services: ["Full collection", "Engraving", "Private salon"],
    image: "/media/editorial/the-gold-standard.jpg",
  },
  {
    city: "Tokyo",
    street: "4-6-1 Ginza, Chūō-ku",
    region: "Tokyo 104-0061, Japan",
    phone: "+81 3 3535 0180",
    hours: ["Daily 11:00–20:00"],
    services: ["Full collection", "Watch servicing", "Private salon"],
    image: "/media/editorial/savoir-faire.jpg",
  },
];
