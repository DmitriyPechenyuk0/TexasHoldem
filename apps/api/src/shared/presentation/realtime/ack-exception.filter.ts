import type { AckFailure } from "@holdem/shared";
import {
	type ArgumentsHost,
	Catch,
	type ExceptionFilter,
	Logger,
} from "@nestjs/common";
import { problemFor } from "../problem.js";

/**
 * Replies to a failed socket command with `{ ok: false, error: Problem }`, the same mapping HTTP
 * uses. Nest passes socket.io handlers `[client, payload, ack, event]`; fire-and-forget events have
 * no ack, so their failures are only logged when unexpected.
 */
@Catch()
export class AckExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger(AckExceptionFilter.name);

	catch(error: unknown, host: ArgumentsHost): void {
		const { problem, unexpected } = problemFor(error);
		if (unexpected) {
			this.logger.error(error);
		}

		const ack: unknown = host.getArgByIndex(2);
		if (typeof ack === "function") {
			const reply: AckFailure = { ok: false, error: problem };
			ack(reply);
		}
	}
}
