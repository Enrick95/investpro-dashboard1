import { Manrope, Unbounded } from "next/font/google";

/** The member card's two faces, as on the joining pages: Unbounded for the name and number, Manrope for the small capitals. */
const unbounded = Unbounded({ subsets: ["latin"], weight: ["600"], display: "swap", variable: "--card-display", preload: false });
const manrope = Manrope({ subsets: ["latin"], weight: ["700", "800"], display: "swap", variable: "--card-text", preload: false });

export const cardFont = `${unbounded.variable} ${manrope.variable}`;
