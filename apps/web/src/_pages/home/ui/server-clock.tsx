"use client";

import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { serverTimeQuery } from "@/shared/api";
import { useServerClock } from "../model/server-clock";

/**
 * The server clock, ticking on the device. The first render shows the time the server prefetched;
 * a fresh fetch on mount measures the offset from this device's clock.
 */
export function ServerClock() {
	const t = useTranslations("home.serverClock");
	const format = useFormatter();
	const { data, dataUpdatedAt, isFetchedAfterMount, isError } = useQuery({
		...serverTimeQuery(),
		// The prefetched answer was timed on the server's clock, so it cannot give the offset.
		refetchOnMount: "always",
		refetchInterval: 60_000,
	});
	const offsetMs = useServerClock((state) => state.offsetMs);
	const sync = useServerClock((state) => state.sync);
	const [now, setNow] = useState<number | null>(null);

	useEffect(() => {
		if (data && isFetchedAfterMount) {
			sync(data.now, dataUpdatedAt);
		}
	}, [data, dataUpdatedAt, isFetchedAfterMount, sync]);

	useEffect(() => {
		if (offsetMs === null) {
			return;
		}
		const timer = setInterval(() => setNow(Date.now() + offsetMs), 1000);
		return () => clearInterval(timer);
	}, [offsetMs]);

	if (!data) {
		return (
			<p className="text-sm text-zinc-500">
				{isError ? t("unavailable") : t("syncing")}
			</p>
		);
	}
	// UTC, so the server and the browser render the same text whatever their time zones.
	const time = format.dateTime(new Date(now ?? Date.parse(data.now)), {
		timeStyle: "medium",
		timeZone: "UTC",
	});
	return (
		<p className="text-sm text-zinc-500 tabular-nums">{t("time", { time })}</p>
	);
}
