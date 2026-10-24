import {
	readThemePreference,
	setThemePreference,
	subscribeToThemePreference,
	themeScript,
} from "./theme";

/** Just enough of a browser for the theme code: storage, events, matchMedia and <html>'s classes. */
function fakeBrowser({ systemDark = false, storage = true } = {}) {
	const stored = new Map<string, string>();
	const media = Object.assign(new EventTarget(), { matches: systemDark });
	const classes = new Set<string>();
	const blocked = () => {
		throw new DOMException("blocked", "SecurityError");
	};
	vi.stubGlobal("localStorage", {
		getItem: storage ? (key: string) => stored.get(key) ?? null : blocked,
		setItem: storage
			? (key: string, value: string) => stored.set(key, value)
			: blocked,
		removeItem: storage ? (key: string) => stored.delete(key) : blocked,
	});
	vi.stubGlobal(
		"window",
		Object.assign(new EventTarget(), { matchMedia: () => media }),
	);
	vi.stubGlobal("document", {
		documentElement: {
			classList: {
				toggle: (name: string, on: boolean) =>
					on ? classes.add(name) : classes.delete(name),
			},
		},
	});
	return {
		stored,
		isDark: () => classes.has("dark"),
		setSystemDark(dark: boolean) {
			media.matches = dark;
			media.dispatchEvent(new Event("change"));
		},
		storageEvent(key: string) {
			window.dispatchEvent(Object.assign(new Event("storage"), { key }));
		},
	};
}

const runThemeScript = () => new Function(themeScript)();

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("theme", () => {
	it("follows the system until a choice is stored", () => {
		const browser = fakeBrowser({ systemDark: true });

		runThemeScript();
		expect(browser.isDark()).toBe(true);
		expect(readThemePreference()).toBe("system");

		browser.setSystemDark(false);
		expect(browser.isDark()).toBe(false);
	});

	it("applies a choice in this tab, stores it, and ignores the system afterwards", () => {
		const browser = fakeBrowser();
		runThemeScript();
		const onChange = vi.fn();
		const unsubscribe = subscribeToThemePreference(onChange);

		setThemePreference("dark");
		expect(browser.isDark()).toBe(true);
		expect(browser.stored.get("theme")).toBe("dark");
		expect(readThemePreference()).toBe("dark");
		expect(onChange).toHaveBeenCalledOnce();

		browser.setSystemDark(false);
		expect(browser.isDark()).toBe(true);

		setThemePreference("system");
		expect(browser.stored.has("theme")).toBe(false);
		expect(browser.isDark()).toBe(false);

		unsubscribe();
		setThemePreference("light");
		expect(onChange).toHaveBeenCalledTimes(2);
	});

	it("follows a choice made in another tab", () => {
		const browser = fakeBrowser();
		runThemeScript();

		browser.stored.set("theme", "dark");
		browser.storageEvent("other");
		expect(browser.isDark()).toBe(false);
		browser.storageEvent("theme");
		expect(browser.isDark()).toBe(true);
	});

	it("treats an unknown stored value as no choice", () => {
		const browser = fakeBrowser({ systemDark: true });
		browser.stored.set("theme", "sepia");

		runThemeScript();
		expect(browser.isDark()).toBe(true);
		expect(readThemePreference()).toBe("system");
	});

	it("falls back to the system when storage is blocked", () => {
		const browser = fakeBrowser({ systemDark: true, storage: false });

		runThemeScript();
		expect(browser.isDark()).toBe(true);
		expect(readThemePreference()).toBe("system");
		expect(() => setThemePreference("light")).not.toThrow();
	});
});
