import { Archivo } from "next/font/google";

/** One family for the VIP application; its narrow width carries the figures and the titles. */
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], display: "swap", variable: "--vip-font" });

export const espaceFont = `${archivo.variable} ${archivo.className}`;
