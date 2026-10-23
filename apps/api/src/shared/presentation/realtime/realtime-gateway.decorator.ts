import type { NamespaceDefinition } from "@holdem/shared/realtime";
import { applyDecorators, UseFilters } from "@nestjs/common";
import { WebSocketGateway } from "@nestjs/websockets";
import { AckExceptionFilter } from "./ack-exception.filter.js";

/**
 * A socket.io gateway for one namespace of the shared realtime contract. Global filters do not
 * reach gateways, so this attaches the ack mapping to every one of them.
 */
export const RealtimeGateway = (
	namespace: NamespaceDefinition,
): ClassDecorator =>
	applyDecorators(
		WebSocketGateway({ namespace: namespace.path }),
		UseFilters(AckExceptionFilter),
	);
