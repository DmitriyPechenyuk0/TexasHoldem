import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	NoSuchKey,
	NotFound,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import {
	ObjectStorage,
	type PresignedUpload,
	type StoredObject,
	type UploadPolicy,
} from "../../application/object-storage.js";
import { AppConfig } from "../config/index.js";

export const S3_CLIENT = Symbol("S3Client");

export const createS3Client = ({ s3 }: AppConfig): S3Client =>
	new S3Client({
		endpoint: s3.endpoint,
		region: s3.region,
		forcePathStyle: s3.forcePathStyle,
		credentials: {
			accessKeyId: s3.accessKeyId,
			secretAccessKey: s3.secretAccessKey,
		},
		// A stalled storage fails the request instead of hanging it.
		requestHandler: { connectionTimeout: 5_000, requestTimeout: 15_000 },
		maxAttempts: 3,
	});

const isMissing = (error: unknown): boolean =>
	error instanceof NoSuchKey || error instanceof NotFound;

@Injectable()
export class S3ObjectStorage extends ObjectStorage implements OnModuleDestroy {
	private readonly bucket: string;
	private readonly publicBase: string;

	constructor(
		@Inject(S3_CLIENT) private readonly client: S3Client,
		config: AppConfig,
	) {
		super();
		this.bucket = config.s3.bucket;
		this.publicBase = config.s3.publicUrl;
	}

	async presignUpload({
		key,
		contentType,
		maxBytes,
		expiresInSeconds,
	}: UploadPolicy): Promise<PresignedUpload> {
		const { url, fields } = await createPresignedPost(this.client, {
			Bucket: this.bucket,
			Key: key,
			// Storage itself refuses a bigger body, another type or another key.
			Conditions: [
				["content-length-range", 1, maxBytes],
				["eq", "$Content-Type", contentType],
			],
			Fields: { "Content-Type": contentType },
			Expires: expiresInSeconds,
		});
		return { url, fields };
	}

	async stat(key: string): Promise<StoredObject | null> {
		try {
			const head = await this.client.send(
				new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
			);
			return { size: head.ContentLength ?? 0 };
		} catch (error) {
			if (isMissing(error)) {
				return null;
			}
			throw error;
		}
	}

	async read(key: string): Promise<Uint8Array | null> {
		try {
			const object = await this.client.send(
				new GetObjectCommand({ Bucket: this.bucket, Key: key }),
			);
			return (await object.Body?.transformToByteArray()) ?? new Uint8Array();
		} catch (error) {
			if (isMissing(error)) {
				return null;
			}
			throw error;
		}
	}

	async write(
		key: string,
		body: Uint8Array,
		{
			contentType,
			cacheControl,
		}: { readonly contentType: string; readonly cacheControl?: string },
	): Promise<void> {
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: key,
				Body: body,
				ContentType: contentType,
				CacheControl: cacheControl,
			}),
		);
	}

	async delete(key: string): Promise<void> {
		// S3 answers a missing key with success too.
		await this.client.send(
			new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
		);
	}

	publicUrl(key: string): string {
		return `${this.publicBase}/${key.split("/").map(encodeURIComponent).join("/")}`;
	}

	onModuleDestroy(): void {
		this.client.destroy();
	}
}
