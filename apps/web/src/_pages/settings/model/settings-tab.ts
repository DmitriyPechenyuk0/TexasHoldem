export const SETTINGS_TABS = ["profile", "account", "language"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** Whether `?tab=` names one of the tabs; anything else opens the default one. */
export const isSettingsTab = (value: unknown): value is SettingsTab =>
	SETTINGS_TABS.includes(value as SettingsTab);
