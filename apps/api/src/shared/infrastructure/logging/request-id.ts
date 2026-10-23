import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

// An id from a proxy or client is kept so one request can be followed across services,
// but only if it is short and plain: it ends up in every log line and in the response.
const ACCEPTED_REQUEST_ID = /^[\w.:-]{1,128}$/;

export function requestIdFor(header: string | string[] | undefined): string {
	return typeof header === "string" && ACCEPTED_REQUEST_ID.test(header)
		? header
		: randomUUID();
}
