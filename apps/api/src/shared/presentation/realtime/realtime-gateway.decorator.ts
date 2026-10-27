import type { NamespaceDefinition } from "@holdem/shared/realtime";
import { applyDecorators, UseFilters, UseGuards } from "@nestjs/common";
import { WebSocketGateway } from "@nestjs/websockets";
import { AckExceptionFilter } from "./ack-exception.filter.js";
import { SocketSessionGuard } from "./socket-session.js";

/**
 * A socket.io gateway for one namespace of the shared realtime contract. Global filters do not
 * reach gateways, so this attaches the ack mapping to every one of them, and the session check
 * that runs before every command.
 */
export const RealtimeGateway = (
	namespace: NamespaceDefinition,
): ClassDecorator =>
	applyDecorators(
		WebSocketGateway({ namespace: namespace.path }),
		UseFilters(AckExceptionFilter),
		UseGuards(SocketSessionGuard),
	);
