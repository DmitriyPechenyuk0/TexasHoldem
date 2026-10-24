import type { ProblemFieldError } from "@holdem/shared";
import { Body, Param, type PipeTransform, Query } from "@nestjs/common";
import { MessageBody } from "@nestjs/websockets";
import type { z } from "zod";

/** A request that does not match its contract. Answered with 400 and every invalid field. */
export class RequestValidationError extends Error {
	constructor(readonly issues: readonly ProblemFieldError[]) {
		super("The request is invalid.");
		this.name = "RequestValidationError";
	}
}

/** Parses a request part with a contract schema from `@holdem/shared`; the handler gets the parsed value. */
export class ZodValidationPipe<
	Schema extends z.ZodType,
> implements PipeTransform<unknown, z.output<Schema>> {
	constructor(
		private readonly schema: Schema,
		private readonly pathPrefix: readonly string[] = [],
	) {}

	transform(value: unknown): z.output<Schema> {
		const result = this.schema.safeParse(value);
		if (result.success) {
			return result.data;
		}
		throw new RequestValidationError(
			result.error.issues.map((issue) => ({
				path: [
					...this.pathPrefix,
					...issue.path.map((key) =>
						typeof key === "symbol" ? key.toString() : key,
					),
				],
				code: issue.code,
				message: issue.message,
			})),
		);
	}
}

/** `@ValidBody(TakeSeatRequest) body: TakeSeatRequest` */
export const ValidBody = (schema: z.ZodType): ParameterDecorator =>
	Body(new ZodValidationPipe(schema));

/** `@ValidQuery(PageQuery) query: PageQuery`, with schemas that coerce query-string text. */
export const ValidQuery = (schema: z.ZodType): ParameterDecorator =>
	Query(new ZodValidationPipe(schema));

/** `@ValidParam("tableId", TableId) tableId: TableId`; issues point at the parameter name. */
export const ValidParam = (
	name: string,
	schema: z.ZodType,
): ParameterDecorator => Param(name, new ZodValidationPipe(schema, [name]));

/** `@ValidPayload(PingEvent.payload) payload: PingPayload` in a socket gateway. */
export const ValidPayload = (schema: z.ZodType): ParameterDecorator =>
	MessageBody(new ZodValidationPipe(schema));
