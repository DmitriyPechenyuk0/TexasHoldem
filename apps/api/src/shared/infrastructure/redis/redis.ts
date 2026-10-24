import { Inject } from "@nestjs/common";
import type { RedisClientType } from "@redis/client";

/** A node-redis client. The shared one comes through `@InjectRedis()`; dedicated ones from `RedisConnections`. */
export type Redis = RedisClientType;

export const REDIS = Symbol("Redis");

export const InjectRedis = (): ParameterDecorator => Inject(REDIS);
