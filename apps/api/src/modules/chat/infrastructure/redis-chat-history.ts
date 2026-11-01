import { Injectable } from "@nestjs/common";
import { AppConfig } from "@/shared/infrastructure/config/index.js";
import {
	InjectRedis,
	type Redis,
} from "@/shared/infrastructure/redis/index.js";
import { ChatHistory, HISTORY_LENGTH } from "../application/chat-history.js";
import type { ChatMessage } from "../domain/chat-message.js";

/** How long a table's chat outlives its last message, should the table never be seen to close. */
export const IDLE_CHAT_TTL_SECONDS = 24 * 60 * 60;
/** How long a closed table's chat is kept. */
export const CLOSED_CHAT_TTL_SECONDS = 60 * 60;

/**
 * Each table's last messages in a capped Redis list, as JSON, under keys prefixed by the
 * database's name. Each message pushes the key's expiry back, until the table closes.
 */
@Injectable()
export class RedisChatHistory extends ChatHistory {
	private readonly prefix: string;

	constructor(
		@InjectRedis() private readonly redis: Redis,
		config: AppConfig,
	) {
		super();
		this.prefix = `${new URL(config.database.url).pathname.slice(1)}:chat`;
	}

	async append(message: ChatMessage): Promise<void> {
		const key = this.keyOf(message.tableId);
		await this.redis
			.multi()
			.rPush(key, JSON.stringify(message))
			.lTrim(key, -HISTORY_LENGTH, -1)
			.expire(key, IDLE_CHAT_TTL_SECONDS)
			.exec();
	}

	async recent(tableId: string): Promise<readonly ChatMessage[]> {
		const stored = await this.redis.lRange(this.keyOf(tableId), 0, -1);
		return stored.map((json) => JSON.parse(json) as ChatMessage);
	}

	async tableClosed(tableId: string): Promise<void> {
		await this.redis.expire(this.keyOf(tableId), CLOSED_CHAT_TTL_SECONDS);
	}

	private keyOf(tableId: string): string {
		return `${this.prefix}:${tableId}`;
	}
}
