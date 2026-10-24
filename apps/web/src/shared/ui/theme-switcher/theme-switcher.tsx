"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import {
	isThemePreference,
	readThemePreference,
	setThemePreference,
	subscribeToThemePreference,
	THEME_PREFERENCES,
	type ThemePreference,
} from "@/shared/lib";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "../dropdown-menu/dropdown-menu";
import { IconButton } from "../icon-button/icon-button";

const icons = { light: Sun, dark: Moon, system: Monitor } as const;

/** The server cannot know the stored choice, so it renders "system"; hydration then corrects it. */
const serverPreference = (): ThemePreference => "system";

/** Light, dark or the system setting; remembered in this browser. */
export function ThemeSwitcher() {
	const t = useTranslations("common.themeSwitcher");
	const preference = useSyncExternalStore(
		subscribeToThemePreference,
		readThemePreference,
		serverPreference,
	);
	const Icon = icons[preference];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<IconButton label={t("label")}>
					<Icon />
				</IconButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup
					value={preference}
					onValueChange={(value) => {
						if (isThemePreference(value)) {
							setThemePreference(value);
						}
					}}
				>
					{THEME_PREFERENCES.map((option) => (
						<DropdownMenuRadioItem key={option} value={option}>
							{t(`options.${option}`)}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
