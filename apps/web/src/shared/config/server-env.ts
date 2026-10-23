import "server-only";
import { z } from "zod";
import { validateEnv } from "./validate-env";

const schema = z
	.object({
		API_URL: z.url({ protocol: /^https?$/ }),
	})
	.transform((env) => ({
		apiUrl: env.API_URL,
	}));

/**
 * Values for server code only; importing this module from a Client Component fails the build.
 * Output prerendered at build time keeps build-time values, so read these after `connection()`
 * when the runtime value matters.
 */
export const serverEnv = validateEnv(schema, process.env);
