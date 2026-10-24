import type { Locale } from "../routing";
import enCommon from "./en/common.json";
import enHome from "./en/home.json";
import ruCommon from "./ru/common.json";
import ruHome from "./ru/home.json";

// One JSON file per namespace and locale. English is the source catalog: its generated
// declarations keep the literal texts, which is how next-intl types ICU arguments.
const en = { common: enCommon, home: enHome };

export type Messages = typeof en;

// The shape of the source catalog with any text: another locale missing a key is a type error
// here, and `pnpm lint:i18n` also catches extra keys and mismatched ICU arguments.
type Catalog<T> = {
	readonly [K in keyof T]: T[K] extends string ? string : Catalog<T[K]>;
};

const catalogs = {
	en,
	ru: { common: ruCommon, home: ruHome },
} satisfies Record<Locale, Catalog<Messages>>;

// next-intl types every locale as the source catalog. The shapes match (checked above);
// only the texts differ, and those literal types matter for `t()` calls alone.
export const messages = catalogs as Readonly<Record<Locale, Messages>>;
