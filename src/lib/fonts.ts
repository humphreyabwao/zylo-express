import { Cormorant_Garamond, Jost, Montserrat } from "next/font/google";

/** Display face — used for headings, prices and anything editorial. */
export const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

/** Interface face — navigation, buttons, body copy, micro-type. */
export const jost = Jost({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jost",
  weight: ["200", "300", "400", "500", "600"],
});

/**
 * Admin face.
 *
 * The storefront is Cormorant and Jost; the dashboard is Montserrat throughout.
 * That is deliberate rather than inconsistent — an operator reading dense tables
 * for an hour wants a workhorse UI face with unambiguous figures, not an
 * editorial one. Loaded only by the admin layout, so a shopper never downloads
 * it.
 *
 * `500` and `600` carry almost all of the dashboard's hierarchy, with `700`
 * reserved for figures that must read at a glance.
 */
export const montserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat",
  weight: ["300", "400", "500", "600", "700"],
});
