import { Geist, Geist_Mono } from "next/font/google";

// Cyrillic too, or the Russian locale falls back to a system font. next/font only reads literals.
const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin", "latin-ext", "cyrillic"],
});
const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin", "latin-ext", "cyrillic"],
});

/** Font variables for `<html className>`; globals.css maps them to the theme. */
export const fontVariables = `${geistSans.variable} ${geistMono.variable}`;
