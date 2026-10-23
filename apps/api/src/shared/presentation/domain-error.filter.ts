import {
	type ArgumentsHost,
	Catch,
	type ExceptionFilter,
	HttpStatus,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { DomainError, type DomainErrorKind } from "../domain/domain-error.js";

const STATUS_BY_KIND: Readonly<Record<DomainErrorKind, HttpStatus>> = {
	"not-found": HttpStatus.NOT_FOUND,
	conflict: HttpStatus.CONFLICT,
	"rule-violation": HttpStatus.UNPROCESSABLE_ENTITY,
	forbidden: HttpStatus.FORBIDDEN,
};

export interface DomainErrorBody {
	readonly statusCode: number;
	readonly code: string;
	readonly message: string;
}

/**
 * Maps domain errors to HTTP responses. Global filters do not reach WebSocket gateways,
 * which map domain errors in their own filter.
 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
	constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

	catch(error: DomainError, host: ArgumentsHost): void {
		const statusCode = STATUS_BY_KIND[error.kind];
		const body: DomainErrorBody = {
			statusCode,
			code: error.code,
			message: error.message,
		};
		this.httpAdapterHost.httpAdapter.reply(
			host.switchToHttp().getResponse(),
			body,
			statusCode,
		);
	}
}
