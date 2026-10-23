import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

export default defineConfig([
	...fsd.configs.recommended,
	{
		// `_app` and `_pages` are the names the official FSD guide for Next.js uses, so they do not
		// clash with the Next.js `app` and `pages` folders. Every other rule already reads them as the
		// app and pages layers (prefixed layers are supported); only this name check flags them.
		files: ["./src/_app/**", "./src/_pages/**"],
		rules: { "fsd/typo-in-layer-name": "off" },
	},
]);
