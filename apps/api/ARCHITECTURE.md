# API architecture

The api is a modular monolith. Each bounded context from the Context Map is a Nest module split into four layers, and every operation goes through the CQRS buses (ADR-003).

## Layout

```
src/
  main.ts                 bootstrap: load config, create the app, listen
  app.module.ts           composition root: the only module that knows all others
  shared/                 cross-cutting building blocks, layered like a context
    domain/               DomainError, Result, shared kernel types (e.g. UserId)
    application/          ports used by every context (Clock)
    infrastructure/       config, adapters (SystemClock), later database and Redis clients
    presentation/         HTTP mapping of domain errors
    shared.module.ts
  modules/<context>/
    domain/               aggregates and deciders, value objects, domain events, errors, repository ports
    application/          commands/, queries/, events/: messages and their handlers
    infrastructure/       repositories (Drizzle), Redis adapters, external services
    presentation/         controllers, socket gateways, request/response mapping
    <context>.module.ts
test/                     e2e tests and their support code
```

A layer folder exists only once it has content. `modules/system` is the reference module: controller → query bus → handler, with no domain of its own.

## Layers

| Layer          | Contains                                               | May import                                        |
| -------------- | ------------------------------------------------------ | ------------------------------------------------- |
| domain         | business rules as plain TypeScript                     | its own domain, `shared/domain`, `@holdem/engine` |
| application    | command, query and event handlers; ports they need     | domain, `shared/domain`, `shared/application`     |
| infrastructure | adapters that implement ports                          | application, domain, `shared/*`                   |
| presentation   | controllers and gateways that translate transport ↔ bus | application messages, `shared/{domain,application,presentation}` |

- Domain code imports nothing from NestJS, I/O libraries or Node built-ins, and never reads the clock, randomness or config: they come in as arguments.
- Command and event handlers reach adapters only through ports and import no I/O library (Drizzle, Redis, socket.io, S3, mail).
- Query handlers may skip the domain and read tables directly through `shared/infrastructure/database` (ADR-003). That is the one place where application code touches infrastructure.
- A context never imports another context's internals, only its `index.ts`: the application-level API and integration events it chooses to expose (Context Map).
- `shared` imports no module, nothing imports `main.ts` or `app.module.ts` except tests, there are no cycles, and production code imports no tests or dev dependencies.

`pnpm --filter @holdem/api lint:deps` checks all of this with dependency-cruiser. It also runs in `pnpm lint`, the pre-commit hook and CI. The rules live in `.dependency-cruiser.ts`, and `test/architecture` has a test for each one.

## Commands, queries, handlers

- A **handler is the use case**. There are no `*UseCase` or application service classes, and controllers or gateways never call domain code or repositories directly: they only send messages to `CommandBus` / `QueryBus`.
- Messages extend the typed bases from `@nestjs/cqrs`, so the bus infers the result: `class GetLobbyQuery extends Query<LobbyView>`, `class TakeSeatCommand extends Command<void>`.
- Command handlers stay thin: load → decide → append → publish.
- Each operation has its own folder with the message, the handler and the handler's test:

```
application/commands/take-seat/
  take-seat.command.ts        TakeSeatCommand
  take-seat.handler.ts        TakeSeatHandler
  take-seat.handler.spec.ts
```

## Naming

| Kind              | Class                         | File                            |
| ----------------- | ----------------------------- | ------------------------------- |
| Command           | `TakeSeatCommand`             | `take-seat.command.ts`          |
| Query             | `GetLobbyQuery`               | `get-lobby.query.ts`            |
| Handler           | `TakeSeatHandler`             | `take-seat.handler.ts`          |
| Domain event      | `SeatTaken` (past tense)      | `seat-taken.event.ts`           |
| Domain error      | `SeatTakenError`              | `seat-taken.error.ts`           |
| Port              | `TableRepository`, `Clock`    | `table.repository.ts`           |
| Adapter           | `DrizzleTableRepository`      | `drizzle-table.repository.ts`   |
| Controller        | `TableController`             | `table.controller.ts`           |
| Gateway           | `TableGateway`                | `table.gateway.ts`              |
| Module            | `TableModule`                 | `table.module.ts`               |

Files are kebab-case with a role suffix. Tests sit next to the code as `*.spec.ts`; e2e tests live in `test/` as `*.e2e-spec.ts`.

## Ports and adapters

A port is an abstract class, so it is both the type and the DI token. The module binds it to an adapter:

```ts
// application/clock.ts
export abstract class Clock {
	abstract now(): Date;
}

// <context>.module.ts
providers: [{ provide: Clock, useClass: SystemClock }];

// a handler
constructor(private readonly clock: Clock) {}
```

`AppConfig` follows the same pattern. Nothing outside `shared/infrastructure/config` reads `process.env` (enforced by lint).

## Errors

Expected business failures are subclasses of `DomainError`. Each one sets a `kind` and a stable `code` (`<context>.<case>`), which is also the key clients translate. `params` fill in the translated message:

```ts
export class SeatTakenError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.seat-taken";

	constructor(seat: number) {
		super(`Seat ${seat} is taken`, { params: { seat } });
	}
}
```

- Domain code returns `Result<T, E>` (`ok(value)` / `err(error)`) instead of throwing, so rules stay pure and easy to test.
- The handler unwraps it and throws the error: `if (!result.ok) throw result.error;`.
- Every failed request is answered by `ProblemFilter` with RFC 9457 problem details (`application/problem+json`, the `Problem` schema in `@holdem/shared`). `problemFor()` holds the mapping:

| Thrown                                                 | HTTP | `code`                                        |
| ------------------------------------------------------ | ---- | --------------------------------------------- |
| invalid request (`@ValidBody` / `@ValidQuery` / `@ValidParam`) | 400  | `request.invalid`, plus `errors` per field     |
| `DomainError` of kind `not-found` / `conflict` / `rule-violation` / `forbidden` | 404 / 409 / 422 / 403 | its own code, plus `params`           |
| `UnauthorizedException` / `ForbiddenException`         | 401 / 403 | `auth.unauthenticated` / `auth.forbidden` |
| unknown route, malformed or oversized body             | 404 / 400 / 413 | `http.not-found` / `request.bad` / `request.too-large` |
| anything else: a bug                                   | 500  | `internal`, no detail, logged with its stack  |

- Each problem carries the request path as `instance` and the `requestId` from the logs.
- Validate every request part with its contract: `@ValidBody(TakeSeatRequest) body: TakeSeatRequest`. Handlers receive the parsed value, with unknown keys dropped.
- Socket gateways are not reached by global filters. They reply `ackFailure(error)`, `{ ok: false, error: Problem }`, from the same mapping, and log the error when `problemFor(error).unexpected`.
- A deliberate non-error status, such as readiness answering 503, is set on the response rather than thrown.

## Persistence

Each context owns its tables. Its schema lives in `infrastructure/persistence/schema.ts` and builds tables with `contextTable`, which adds the context prefix and maps camelCase properties to snake_case columns:

```ts
// modules/lobby/infrastructure/persistence/schema.ts
const table = contextTable("lobby");

export const lobbyTables = table("tables", {
	id: uuid().primaryKey().defaultRandom(),
	smallBlind: integer().notNull(), // column small_blind
}); // table lobby_tables
```

- Repositories and query handlers get the Drizzle client with `@InjectDatabase() private readonly db: Database`.
- A context never reads another context's tables (Context Map).
- Migrations are generated from the schemas and committed in `migrations/`:

| Command            | Does                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `pnpm db:generate` | writes a migration for schema changes (`--name add-lobby-tables`)    |
| `pnpm db:migrate`  | applies pending migrations to `DATABASE_URL`                        |
| `pnpm db:check`    | warns when migrations and schemas disagree                          |
| `pnpm db:studio`   | opens Drizzle Studio                                                |

CI applies the migrations and fails when a schema change has no migration.

## Redis, health and shutdown

- The shared Redis client comes through `@InjectRedis() private readonly redis: Redis`. Pub/sub subscribers and blocking commands need a dedicated connection: `RedisConnections.open("<purpose>")`, which the app closes on shutdown.
- Clients connect in the background and reconnect on their own, so a Redis outage neither blocks startup nor crashes the process.
- `GET /health` is liveness and never touches a dependency. `GET /health/ready` asks every `HealthIndicator` (2 s each) and answers 503 when one is down.
- A new dependency gets a `HealthIndicator` adapter next to its client, listed under `HEALTH_INDICATORS` in `SharedModule`.
- SIGTERM and SIGINT stop the HTTP server and run the `onApplicationShutdown` hooks, which close the database pool and Redis. A process that has not exited after 10 s is stopped.

## Logging

- Log through Nest's `Logger` (`private readonly logger = new Logger(TakeSeatHandler.name)`). pino sits behind it. Pass fields as an object: `this.logger.log({ msg: "seat taken", tableId, seat })`.
- Every line written while handling an HTTP request carries its `requestId`: the incoming `x-request-id` when it is plain, otherwise a new UUID, echoed back in the response.
- Socket handlers wrap their work in `LogContext.run({ connectionId, tableId }, () => …)`, the port in `shared/application`. The fields then reach every line inside, across awaits.
- Every command is logged at debug level with its name, `durationMs` and `outcome`: `succeeded`, `rejected` (a domain error, with its `code`) or `failed`.
- Request lines contain the method, the path without the query string and the client address. Headers, query strings and bodies are never logged. Known secret keys in logged objects (`password`, `token`, `secret`, …, up to three levels deep) are replaced with `[redacted]`. Still, do not log credentials.
- Health checks are not logged. `LOG_LEVEL` sets the level: by default `debug` with readable lines in development, `info` with JSON lines elsewhere.

## Imports

- Inside a module, use relative paths: `./take-seat.command.js`.
- Across modules or into `shared`, use the `@/` alias for `src/`: `@/shared/application/clock.js`.
- Always write the `.js` extension (ESM).

## Tests

| Command              | Runs                                                       | Needs `pnpm infra:up` |
| -------------------- | ---------------------------------------------------------- | --------------------- |
| `pnpm test`          | unit tests (`*.spec.ts`)                                   | no                    |
| `pnpm test:e2e`      | e2e tests (`*.e2e-spec.ts`)                                | yes                   |
| `pnpm test:coverage` | both, with one coverage report in `coverage/` and its gate | yes                   |

- Coverage counts every file in `src` except `main.ts`, so untested files lower it too. The thresholds in `vitest.config.ts` are a baseline just under the current numbers: raise them when coverage grows, never lower them to make a change pass. `packages/engine` requires 100%.
- Unit-test handlers by constructing them with fakes for their ports; no Nest container needed.
- Unit-test domain code with plain inputs and outputs (Given/When/Then for deciders).
- e2e tests boot the real app through `createTestApp()` from `test/support`, configured from `.env.example`.
- Tests that touch the database call `createTestDatabase()`: it creates a fresh `holdem_test_*` database with every migration applied, and `drop()` removes it. Pass its `url` to `createTestApp({ config: { database: { url } } })`. They need the services from `pnpm infra:up`.
