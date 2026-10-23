import { z } from "zod";
import { validateEnv } from "./validate-env";

const schema = z
	.object({
		NEXT_PUBLIC_API_URL: z.url({ protocol: /^https?$/ }),
	})
	.transform((env) => ({
		apiUrl: env.NEXT_PUBLIC_API_URL,
	}));

/**
 * Values that are safe in client code. Next.js inlines them at build time, which only works
 * when each variable is referenced literally as `process.env.NEXT_PUBLIC_*`.
 */
export const publicEnv = validateEnv(schema, {
	NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
