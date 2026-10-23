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
	abstract readonly webOrigin: string;
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
