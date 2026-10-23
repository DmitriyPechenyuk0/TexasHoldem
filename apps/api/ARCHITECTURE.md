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

Expected business failures are subclasses of `DomainError`. Each one sets a `kind` and a stable `code` (`<context>.<case>`):

```ts
export class SeatTakenError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.seat-taken";
}
```

- Domain code returns `Result<T, E>` (`ok(value)` / `err(error)`) instead of throwing, so rules stay pure and easy to test.
- The handler unwraps it and throws the error: `if (!result.ok) throw result.error;`.
- Presentation maps the kind to a status. Over HTTP, `DomainErrorFilter` replies with `{ statusCode, code, message }`:

| kind             | HTTP |
| ---------------- | ---- |
| `not-found`      | 404  |
| `conflict`       | 409  |
| `rule-violation` | 422  |
| `forbidden`      | 403  |

- Anything else is a bug: Nest answers 500 without details. Global filters do not reach WebSocket gateways, so gateways get their own mapping.

## Imports

- Inside a module, use relative paths: `./take-seat.command.js`.
- Across modules or into `shared`, use the `@/` alias for `src/`: `@/shared/application/clock.js`.
- Always write the `.js` extension (ESM).

## Tests

- Unit-test handlers by constructing them with fakes for their ports; no Nest container needed.
- Unit-test domain code with plain inputs and outputs (Given/When/Then for deciders).
- e2e tests boot the real app through `createTestApp()` from `test/support`, configured from `.env.example`.
