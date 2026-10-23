import type { Ack } from "@holdem/shared";
import {
	type PingAck,
	PingEvent,
	type PingPayload,
	systemNamespace,
} from "@holdem/shared/realtime";
import { QueryBus } from "@nestjs/cqrs";
import { SubscribeMessage } from "@nestjs/websockets";
import { RealtimeGateway } from "@/shared/presentation/realtime/realtime-gateway.decorator.js";
import { ValidPayload } from "@/shared/presentation/request-validation.js";
import { GetServerTimeQuery } from "../application/queries/get-server-time/get-server-time.query.js";

@RealtimeGateway(systemNamespace)
export class SystemGateway {
	constructor(private readonly queryBus: QueryBus) {}

	/** Round-trip time and clock correction for the client; its `sentAt` comes back unchanged. */
	@SubscribeMessage(PingEvent.name)
	async ping(
		@ValidPayload(PingEvent.payload) { sentAt }: PingPayload,
	): Promise<Ack<PingAck>> {
		const { now } = await this.queryBus.execute(new GetServerTimeQuery());
		return { ok: true, data: { sentAt, serverTime: now.toISOString() } };
	}
}
