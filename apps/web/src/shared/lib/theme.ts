export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

const STORAGE_KEY = "theme";
/** Fired on window when this tab changes the preference. */
const CHANGE_EVENT = "themechange";

export const isThemePreference = (value: unknown): value is ThemePreference =>
	THEME_PREFERENCES.includes(value as ThemePreference);

/**
 * Puts the `dark` class on <html> for a stored "dark", or for no stored choice on a dark system,
 * and keeps it in sync with the system setting, other tabs and `setThemePreference`. It must stay
 * self-contained: `themeScript` inlines its source.
 */
function initTheme(storageKey: string, changeEvent: string) {
	const media = window.matchMedia("(prefers-color-scheme: dark)");
	const apply = () => {
		let stored: string | null = null;
		try {
			stored = localStorage.getItem(storageKey);
		} catch {
			// Storage is blocked: follow the system.
		}
		const dark = stored === "dark" || (stored !== "light" && media.matches);
		document.documentElement.classList.toggle("dark", dark);
	};
	apply();
	media.addEventListener("change", apply);
	window.addEventListener(changeEvent, apply);
	window.addEventListener("storage", (event) => {
		if (event.key === storageKey) {
			apply();
		}
	});
}

/**
 * Runs in <head> before the first paint, so a dark page never flashes light. The static HTML
 * cannot know the visitor's choice, hence a script rather than a server-rendered class.
 */
export const themeScript = `(${initTheme.toString()})(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(CHANGE_EVENT)});`;

export function readThemePreference(): ThemePreference {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return isThemePreference(stored) ? stored : "system";
	} catch {
		return "system";
	}
}

/** Stores the choice ("system" clears it) and applies it in this tab; other tabs follow. */
export function setThemePreference(preference: ThemePreference): void {
	try {
		if (preference === "system") {
			localStorage.removeItem(STORAGE_KEY);
		} else {
			localStorage.setItem(STORAGE_KEY, preference);
		}
	} catch {
		// Storage is blocked: the choice lasts until the page reloads.
	}
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToThemePreference(onChange: () => void): () => void {
	window.addEventListener(CHANGE_EVENT, onChange);
	window.addEventListener("storage", onChange);
	return () => {
		window.removeEventListener(CHANGE_EVENT, onChange);
		window.removeEventListener("storage", onChange);
	};
}
