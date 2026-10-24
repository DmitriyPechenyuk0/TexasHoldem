"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/shared/lib";
import { IconButton } from "../icon-button/icon-button";
import { Input, type InputProps } from "../input/input";

/** A password input with a button that shows what was typed. */
export function PasswordInput({
	className,
	...props
}: Omit<InputProps, "type">) {
	const t = useTranslations("common.ui");
	const [visible, setVisible] = useState(false);

	return (
		<div className="relative">
			<Input
				type={visible ? "text" : "password"}
				className={cn("pr-10", className)}
				{...props}
			/>
			<IconButton
				label={visible ? t("hidePassword") : t("showPassword")}
				size="sm"
				tooltip={false}
				disabled={props.disabled}
				onClick={() => setVisible((shown) => !shown)}
				className="absolute top-1 right-1"
			>
				{visible ? <EyeOff /> : <Eye />}
			</IconButton>
		</div>
	);
}
