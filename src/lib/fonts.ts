import { Cormorant_Garamond, Jost } from "next/font/google";

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
