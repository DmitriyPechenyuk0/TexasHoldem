import type { Locale } from "../routing";
import enAuth from "./en/auth.json";
import enCommon from "./en/common.json";
import enErrors from "./en/errors.json";
import enHome from "./en/home.json";
import enProfile from "./en/profile.json";
import enSettings from "./en/settings.json";
import ruAuth from "./ru/auth.json";
import ruCommon from "./ru/common.json";
import ruErrors from "./ru/errors.json";
import ruHome from "./ru/home.json";
import ruProfile from "./ru/profile.json";
import ruSettings from "./ru/settings.json";

// One JSON file per namespace and locale. English is the source catalog: its generated
// declarations keep the literal texts, which is how next-intl types ICU arguments.
const en = {
	auth: enAuth,
	common: enCommon,
	errors: enErrors,
	home: enHome,
	profile: enProfile,
	settings: enSettings,
};

export type Messages = typeof en;

// The shape of the source catalog with any text: another locale missing a key is a type error
// here, and `pnpm lint:i18n` also catches extra keys and mismatched ICU arguments.
type Catalog<T> = {
	readonly [K in keyof T]: T[K] extends string ? string : Catalog<T[K]>;
};

const catalogs = {
	en,
	ru: {
		auth: ruAuth,
		common: ruCommon,
		errors: ruErrors,
		home: ruHome,
		profile: ruProfile,
		settings: ruSettings,
	},
} satisfies Record<Locale, Catalog<Messages>>;

// next-intl types every locale as the source catalog. The shapes match (checked above);
// only the texts differ, and those literal types matter for `t()` calls alone.
export const messages = catalogs as Readonly<Record<Locale, Messages>>;
