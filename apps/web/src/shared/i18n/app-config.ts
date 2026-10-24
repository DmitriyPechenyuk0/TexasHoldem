import type { Messages } from "./messages";
import type { Locale } from "./routing";

// Type-safe keys: `t("home.title")` compiles, a typo in a key or a locale does not.
declare module "next-intl" {
	interface AppConfig {
		Locale: Locale;
		Messages: Messages;
	}
}
