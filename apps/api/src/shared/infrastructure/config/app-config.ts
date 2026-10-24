export type LogLevel =
	"trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";

export interface OAuthClient {
	readonly clientId: string;
	readonly clientSecret: string;
}

/**
 * Validated application configuration. The class doubles as the DI token:
 * `constructor(private readonly config: AppConfig)`.
 */
export abstract class AppConfig {
	abstract readonly nodeEnv: "development" | "test" | "production";
	abstract readonly port: number;
	/** `pretty` is human-readable output for development; otherwise logs are JSON lines. */
	abstract readonly log: { readonly level: LogLevel; readonly pretty: boolean };
	abstract readonly webOrigin: string;
	/** Express's `trust proxy`, so the client address behind a load balancer is the real one. */
	abstract readonly trustProxy: boolean | number | string;
	abstract readonly database: { readonly url: string };
	abstract readonly redis: { readonly url: string };
	abstract readonly smtp: {
		readonly host: string;
		readonly port: number;
		readonly secure: boolean;
		readonly auth?: { readonly user: string; readonly password: string };
		readonly from: string;
	};
	abstract readonly s3: {
		readonly endpoint: string;
		readonly region: string;
		readonly accessKeyId: string;
		readonly secretAccessKey: string;
		readonly bucket: string;
		readonly forcePathStyle: boolean;
	};
	abstract readonly auth: {
		readonly secret: string;
		readonly oauth: {
			readonly google?: OAuthClient;
			readonly github?: OAuthClient;
			readonly discord?: OAuthClient;
		};
	};
}
