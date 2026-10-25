import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("auth.verifyEmail");
	return { title: t("metaTitle") };
}
