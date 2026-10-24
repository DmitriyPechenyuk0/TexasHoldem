import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

/** Font variables for `<html className>`; globals.css maps them to the theme. */
export const fontVariables = `${geistSans.variable} ${geistMono.variable}`;
