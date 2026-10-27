"use client";

import { useEffect } from "react";
import { chooseUsernameRedirect, useViewer } from "@/entities/viewer";
import { usePathname, useRouter } from "@/shared/i18n";

/**
 * Sends a viewer whose account has no username yet to the username step, from any page, and back
 * afterwards. Protected pages redirect on the server already (`requireViewer`); this covers the
 * public ones, where the account could otherwise look as if it were ready.
 */
export function UsernameGate() {
	const viewer = useViewer();
	const pathname = usePathname();
	const router = useRouter();

	useEffect(() => {
		const target = chooseUsernameRedirect(
			viewer,
			`${pathname}${window.location.search}`,
		);
		if (target) {
			router.replace(target);
		}
	}, [viewer, pathname, router]);

	return null;
}
