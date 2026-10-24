import "server-only";
import { cookies } from "next/headers";
import { serverEnv } from "@/shared/config/index.server";
import { createHttpClient, type HttpClient } from "./http";

/**
 * The client for Server Components and Route Handlers: it calls the api at its server-side address
 * and forwards the visitor's cookies, so requests run in their session. Reading cookies makes the
 * caller dynamic, so render it inside `<Suspense>`.
 */
export async function getServerHttp(): Promise<HttpClient> {
	const cookie = (await cookies()).toString();
	return createHttpClient({
		baseUrl: serverEnv.apiUrl,
		headers: cookie ? { cookie } : {},
	});
}
