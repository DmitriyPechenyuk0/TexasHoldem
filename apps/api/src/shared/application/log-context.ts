export type LogBindings = Readonly<Record<string, string | number>>;

/**
 * Port for attaching fields to every log line written inside `fn`, across awaits. HTTP requests
 * get their `requestId` automatically; socket handlers use this for `connectionId` and `tableId`.
 */
export abstract class LogContext {
	abstract run<T>(bindings: LogBindings, fn: () => T): T;
}
