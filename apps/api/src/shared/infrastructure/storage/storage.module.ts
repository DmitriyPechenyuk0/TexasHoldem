import { Global, Module } from "@nestjs/common";
import { ObjectStorage } from "../../application/object-storage.js";
import { AppConfig } from "../config/index.js";
import {
	createS3Client,
	S3_CLIENT,
	S3ObjectStorage,
} from "./s3-object-storage.js";

/**
 * Provides the `ObjectStorage` port. No health indicator: without storage only avatar uploads
 * fail, which must not take the api out of the load balancer.
 */
@Global()
@Module({
	providers: [
		{ provide: S3_CLIENT, inject: [AppConfig], useFactory: createS3Client },
		{ provide: ObjectStorage, useClass: S3ObjectStorage },
	],
	exports: [ObjectStorage],
})
export class StorageModule {}
