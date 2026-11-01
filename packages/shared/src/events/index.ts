import { z } from "zod";

// Integration events between the api's contexts (Context Map), as they travel between api
// instances. Each is named `<context>.<event>` and versioned: a change to its data is a new version
// with a schema of its own, and an instance drops a version it does not know.

/** An integration event on the wire: who sent it, which event and version, and its data. */
export const IntegrationEventEnvelope = z.object({
	/** The api instance that published it, which has handled it already. */
	from: z.string().min(1),
	name: z.string().regex(/^[a-z]+(?:-[a-z]+)*\.[a-z]+(?:-[a-z]+)*$/),
	v: z.int().positive(),
	data: z.unknown(),
});
export type IntegrationEventEnvelope = z.infer<typeof IntegrationEventEnvelope>;

export * from "./identity.js";
export * from "./table.js";
