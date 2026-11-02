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
    infrastructure/       config, database, Redis, logging, mail, adapters (SystemClock)
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
- Query handlers may skip the domain and read tables directly through `shared/infrastructure/database` and their own context's `infrastructure/persistence` schema (ADR-003). That is the one place where application code touches infrastructure.
- A context never imports another context's internals, only its `index.ts`: the application-level API and integration events it chooses to expose (Context Map).
- `shared` imports no module, nothing imports `main.ts` or `app.module.ts` except tests, there are no cycles, and production code imports no tests or dev dependencies.

`pnpm --filter @holdem/api lint:deps` checks all of this with dependency-cruiser. It also runs in `pnpm lint`, the pre-commit hook and CI. The rules live in `.dependency-cruiser.ts`, and `test/architecture` has a test for each one.

## Commands, queries, handlers

- A **handler is the use case**. There are no `*UseCase` or application service classes, and controllers or gateways never call domain code or repositories directly: they only send messages to `CommandBus` / `QueryBus`.
- Messages extend the typed bases from `@nestjs/cqrs`, so the bus infers the result: `class GetLobbyQuery extends Query<LobbyView>`, `class TakeSeatCommand extends Command<void>`.
- Command handlers stay thin: load → decide → append → publish (integration events through `IntegrationEventBus`, see "Integration events").
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
- Socket gateways are not reached by global filters. `@RealtimeGateway` adds `AckExceptionFilter`, which replies `{ ok: false, error: Problem }` from the same mapping and logs unexpected errors.
- A deliberate non-error status, such as readiness answering 503, is set on the response rather than thrown.

## Realtime

Gateways live in `presentation/` like controllers, and serve one namespace of `@holdem/shared/realtime`:

```ts
@RealtimeGateway(systemNamespace)
export class SystemGateway {
	constructor(private readonly queryBus: QueryBus) {}

	@SubscribeMessage(PingEvent.name)
	async ping(@ValidPayload(PingEvent.payload) { sentAt }: PingPayload): Promise<Ack<PingAck>> {
		const { now } = await this.queryBus.execute(new GetServerTimeQuery());
		return { ok: true, data: { sentAt, serverTime: now.toISOString() } };
	}
}
```

- Validate every payload with `@ValidPayload(Event.payload)`: an invalid one is answered with a 400 problem before the handler runs.
- A command returns its `Ack`; a thrown error becomes `{ ok: false, error: Problem }`. Gateways, like controllers, only send messages to the buses.
- socket.io shares the HTTP server and its CORS policy (`WEB_ORIGIN`, with credentials). `configureApp()` sets both, for `main.ts` and the e2e tests alike.
- WebSocket is the only transport (the web client asks for it too): a connection stays on the instance it reached, so instances behind a load balancer need no sticky sessions, as long-polling would.
- Every namespace goes through the Redis streams adapter (`@socket.io/redis-streams-adapter`, on its own connection `socket.io`), so `server.to(room)` reaches the room's sockets on every instance. Rooms are per namespace: `user:<userId>` (a user's own payloads, on `/table` and `/social`), `table:<tableId>` and `lobby`. The adapter appends each broadcast to the Redis stream `socket.io` before emitting to this instance's sockets, so a batch can arrive after an ack sent later; clients drop batches older than their snapshot. Its read blocks for 1 s (`ADAPTER_READ_BLOCK_MS`), within the 2 s command timeout its connections inherit. While Redis is down its publishes fail at once (`adapterClient`), so this instance's sockets still get every broadcast without delay and only other instances miss them. Its reading connections close gracefully when the server closes, so no pending command is left rejected.
- `pnpm start:two` (`scripts/two-instances.mjs`) runs two built instances on `PORT + 1` and `PORT + 2` behind a round-robin TCP proxy on `PORT`, to try the app as production runs it.

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

## Event store

Event-sourced aggregates (the table, and the hands it runs) are stored as streams of events (ADR-002), through the `EventStore` port in `shared/application`:

- `append(streamId, expectedVersion, events, metadata?)` stores all the events or none, after the stream's last one, and answers the new version. The stream must be at `expectedVersion` (0 for a new one); otherwise it throws `ConcurrencyError` (409 `event-store.version-conflict`), and the command is read, decided and appended again.
- `appendToStreams(appends, metadata?)` does the same for several streams in one transaction, for a decision that changes more than one (a table and its hand).
- `readStream(streamId, fromVersion?)` answers a stream's events in order. `readAll(fromPosition, limit)` pages through every stream of the store by `globalPosition`, for projections.
- Each event carries `metadata` (`correlationId`, `causationId`, `userId`) and `occurredAt`, the time it was stored.
- Command handlers use the helpers in `shared/application/event-sourcing.ts` with a `Decider` (`shared/domain/decider.ts`; the table's is `tableDecider`):

```ts
const loaded = await loadDecider(this.events, tableDecider, `table-${tableId}`);
const decision = tableDecider.decide(command, loaded.state);
if (!decision.ok) throw decision.error;
await saveDecider(
	this.events,
	tableDecider,
	`table-${tableId}`,
	loaded,
	decision.value,
	metadata,
);
```

- **Fencing.** `EventMetadata.leaseEpoch` is the epoch of the lease the writer held. An append that carries one is refused with `FencedError` (`event-store.fenced`) when the stream's last event has a newer epoch. Epochs only grow along a stream, so a writer that lost its lease can append nothing once the new holder has. The check is part of the same insert statement, so it costs no extra round trip.
- Stored events are never changed. A new shape of an event bumps its `v`, and an upcaster turns the old one into the new one as it is read: `Upcasters` maps a type and the version it upgrades from to a function, and they are chained until the current version.
- `PostgresEventStore` keeps a context's streams in its own table, which its schema declares with `eventsTable("<context>")` (the table context: `table_events`). An append is one statement: it inserts nothing unless the stream is at the expected version, and `UNIQUE(stream_id, version)` turns away the loser of two appends that race for the same one. Type and version have columns of their own; the rest of the event is the `payload` (jsonb).
- One append of 1,000 events and reading them back takes about 25 ms locally. Appends one at a time are bound by the disk flushing each commit (about 1.2 ms here, so some 550 commands a second per stream), which is far more than a table needs.
- `globalPosition` is taken when a row is inserted, so an append that commits later can still land behind a position a projection has already read. Projections that must see every event wait for a short lag or rebuild from the start; the lobby gets integration events instead (POK-74).
- Hand events carry the deck: the stored events are as secret as the seed until the hand ends (packages/engine/README.md, "Security and storage"). The store never logs payloads or metadata, and clients only ever get redacted views.
- Handler tests use `InMemoryEventStore` (`test/support`). `test/support/event-store-contract.ts` runs the same rules against it and against Postgres, so the fake cannot drift.

## Integration events

Contexts tell each other what happened through integration events (Context Map); `TableChanged`, which carries the deck, is an in-process event of the table context and never one of these.

- An integration event is a class of plain data marked `@IntegrationEvent({ name, version, schema, broadcast })` (`shared/application/integration-events.ts`). `name` is `<context>.<event>` (`identity.user-registered`), and `schema` is that version's zod schema in `@holdem/shared/events`. A change to the data is a new version with a new schema.
- Subscribers are `@EventsHandler`s. Contexts publish through the `IntegrationEventBus` port, never through `EventBus`.
- `RedisIntegrationEventBus` publishes on this instance's `EventBus`. A `broadcast` event also goes out on the Redis channel `integration-events`, and every other instance checks it against its schema and publishes it on its own `EventBus`. A sender ignores its own broadcasts. Broadcast is for subscribers that keep something per instance (a read model in memory, the sockets it serves); the rest are handled once, where the event was published.
- Publishing waits for the transaction to commit. Inside `inTransaction(db, work)` (`shared/infrastructure/database`), events go out once it has committed, in order, and a rollback drops them. Outside one, write first, then publish. Either way an event never tells of a change that did not happen. Transactions do not nest: work uses the `tx` it is given.
- Delivery is at most once. An instance that stops between the commit and the publish, or that is not subscribed when a broadcast goes out (Redis unreachable, restarting), misses the event; while Redis fails, events stay on their instance and a warning is logged once. An instance that does not know an event's name or version (during a rolling deploy) drops it with a warning. A transactional outbox would make delivery at least once (POK-130).

## Redis, health and shutdown

- The shared Redis client comes through `@InjectRedis() private readonly redis: Redis`. Pub/sub subscribers and blocking commands need a dedicated connection: `RedisConnections.open("<purpose>")`, which the app closes on shutdown.
- Clients connect in the background and reconnect on their own, so a Redis outage neither blocks startup nor crashes the process. Meanwhile commands wait in a bounded queue and fail after 2 s (`REDIS_COMMAND_TIMEOUT_MS`), so a caller never hangs; a connection for blocking commands will need a longer timeout.
- `GET /api/health` is liveness and never touches a dependency. `GET /api/health/ready` asks every `HealthIndicator` (2 s each) and answers 503 when one is down.
- A new dependency gets a `HealthIndicator` adapter next to its client, listed under `HEALTH_INDICATORS` in `SharedModule`.
- SIGTERM and SIGINT stop the HTTP server and run the `onApplicationShutdown` hooks, which close the database pool and Redis. A process that has not exited after 10 s is stopped.

## Email

Handlers send email through the `Mailer` port in `shared/application`. The email names a template and its values; the recipient's locale picks the language:

```ts
this.mailer.send({
	to: user.email,
	locale: user.locale, // "ru", "ru-RU", …; unknown or missing → English
	template: "verify-email",
	params: { username: user.username, url, expiresInMinutes: 24 * 60 },
});
```

- `send` renders the email and returns at once. `SmtpMailer` (nodemailer) delivers it in the background, so a slow or failing mail server never fails or delays the request. A transient failure is retried after 1 s, 5 s and 25 s; a permanent rejection (5xx reply, invalid address) is not. Each failed attempt is logged with the template and the SMTP code, never the recipient's address.
- On shutdown, attempts in flight finish and pending retries are dropped, with an error line each.
- Templates live in `shared/infrastructure/mail/templates`: one file per template with its copy in every locale (a missing translation fails to compile), and one layout that renders it as HTML and plain text. Copy is plain text, and the layout escapes every value it puts into the HTML. The layout uses the web app's colours, follows the reader's dark mode where the client supports it, and keeps every style inline, so clients that drop `<style>` still show the light version. `preview` is the line inbox lists show next to the subject. A new template is a new member of the `EmailContent` union plus its file.
- Locally, Mailpit catches every email (http://localhost:8025); the e2e tests read it through its API (`test/support/mailpit.ts`). In production, STARTTLS is required.
- There is no mail `HealthIndicator`: delivery is retried in the background, so a mail outage must not take the api out of the load balancer.

## Logging

- Log through Nest's `Logger` (`private readonly logger = new Logger(TakeSeatHandler.name)`). pino sits behind it. Pass fields as an object: `this.logger.log({ msg: "seat taken", tableId, seat })`.
- Every line written while handling an HTTP request carries its `requestId`: the incoming `x-request-id` when it is plain, otherwise a new UUID, echoed back in the response.
- Socket handlers wrap their work in `LogContext.run({ connectionId, tableId }, () => …)`, the port in `shared/application`. The fields then reach every line inside, across awaits.
- Every command is logged at debug level with its name, `durationMs` and `outcome`: `succeeded`, `rejected` (a domain error, with its `code`) or `failed`.
- Request lines contain the method, the path without the query string and the client address (from `X-Forwarded-For` only for the proxies `TRUST_PROXY` trusts). Headers, query strings and bodies are never logged. Secret-looking keys in logged objects (`password`, `token`, `secret`, `Authorization`, `set-cookie`, …, in any case and at any depth) are replaced with `[redacted]`. Still, do not log credentials.
- Lines go to stdout through a buffer, so logging never blocks the event loop; what is left in it is written synchronously when the process exits.
- Health checks are not logged. `LOG_LEVEL` sets the level: by default `debug` with readable lines in development, `info` with JSON lines elsewhere.

## Identity and sessions

Identity is a generic context run by Better Auth (ADR-005 and its addendum), in `modules/identity`:

- Better Auth serves its own endpoints under `/api/auth/*`: sign-up, sign-in with email, username or an OAuth provider, sign-out, email verification and resending its link, password reset, linking providers. It owns the `identity_*` tables (`infrastructure/persistence/schema.ts`, hand-written to match what it expects).
- `AuthMiddleware` mounts it. It runs after the request logger and the same-origin check, and adds what Better Auth lacks: JSON bodies only (415 otherwise; it would also parse HTML form posts), our contracts for the bodies we accept (`@holdem/shared/contracts/identity`, unknown keys dropped), the client address from Express's `req.ip` (so TRUST_PROXY decides, not a client-sent `X-Forwarded-For`) and problem details for its errors: `USERNAME_IS_ALREADY_TAKEN` becomes `auth.username-is-already-taken`.
- No session before the email is verified; the link in the email signs the user in. A taken email answers exactly like a new sign-up. Links in emails start at `API_ORIGIN`, never at the request's Host.
- Callback URLs must lead to `WEB_ORIGIN`. A relative one is resolved against it, and a request that sends a link without one gets `WEB_ORIGIN/`, so a link always returns to the web app: on success, or with `?error=TOKEN_EXPIRED` or `?error=INVALID_TOKEN`.
- The link is a JWT signed with `AUTH_SECRET` that lasts 24 h; nothing is stored. Opened again after verifying, it only redirects and creates no session.
- The link goes out on sign-up, on a sign-in with the right password while unverified (refused with `auth.email-not-verified`), and on `POST /api/auth/send-verification-email`. The last one answers `{ status: true }` for any address. See "Rate limits" for how many emails an address gets.
- Password reset: `POST /api/auth/request-password-reset` with the web page to return to (`redirectTo`) emails a link that works once, for an hour. It answers the same for any address and takes at least 500 ms (`MINIMUM_RESPONSE_MS`), since only a known address gets a token written. The link passes through the api to `redirectTo?token=…`, or `?error=INVALID_TOKEN` once expired or used. The page then posts `{ token, newPassword }` to `/api/auth/reset-password`. Success signs every session out and kills every other reset link of the account. An unverified email counts as verified from then on (`UserVerified`), since the link reached its inbox. Reset emails are throttled like verification emails, each kind on its own.
- Changing the password: `POST /api/auth/change-password` with `{ currentPassword, newPassword }`, signed in, for an account that has one (`auth.invalid-password`, `auth.credential-account-not-found`). The contract always ends every other session; this browser gets a new one.
- A new password (sign-up, reset, change) that appears in a known breach is refused with 400 `auth.password-compromised`. `PwnedPasswords` asks Have I Been Pwned's range API with k-anonymity: only the first 5 hex characters of the password's SHA-1 leave the api, and padding hides how many suffixes matched. It is checked before the email is looked up, so a sign-up still answers the same for a taken address. When the service has not answered within 3 s the password is accepted, with a warning. The e2e tests replace the port with `FakePasswordBreaches`.
- The owner is told by email when the ways into the account change: `password-changed` after a reset or a change, `sign-in-method-added` when a provider is linked. A stranger who did it with a stolen session is noticed. These emails are not throttled, since only a signed-in owner or a reset link triggers them.
- Endpoints the web app does not use are disabled (`disabledPaths`, 404): `/update-user` (Profile owns display data), `/get-access-token`, `/refresh-token` and `/account-info` (provider tokens never reach the browser), and `/verify-password` (from a stolen session, a password-guessing oracle without the limit of `/change-password`).
- OAuth with Google, GitHub and Discord (`socialProviders`): a provider exists only when both its keys are set, and `GET /api/oauth-providers` lists those, for the web app's buttons. Only the redirect flow is accepted: the body contract drops `idToken`, `scopes` and `additionalData`. `POST /api/auth/sign-in/social` answers the provider's page; the provider sends the browser back to `/api/auth/callback/<provider>`, which redirects to `callbackURL`, `newUserCallbackURL` for a new account, or `errorCallbackURL?error=<code>`. Without a readable state (it holds those URLs) a failure lands on `WEB_ORIGIN/sign-in?error=…` (`onAPIError`). The locale of a new account's emails travels in the state's server context, which the client cannot change.
  - A new account takes the provider's handle (GitHub login, Discord username) as its username when it is valid and free; Google has none. Otherwise the account starts with a null username: it has a session but no profile, and `RequirePlayer` refuses it until `PUT /api/me/username` (once; `identity.username-taken`, `identity.username-already-chosen`). `name` holds the provider's name until then, for the emails' greeting, and the provider's picture is not kept.
  - An email that matches an existing account is never linked silently (`disableImplicitLinking`): the sign-in fails with `account_not_linked`, since whoever holds that address at the provider would otherwise get in. The owner signs in and links the provider: `POST /api/auth/link-social` adds it on the way back, whatever its email. `GET /api/auth/list-accounts` lists the ways to sign in (`credential` is the password) and `POST /api/auth/unlink-account` removes one, never the last (`auth.failed-to-unlink-last-account`). Linking and unlinking both need a sign-in younger than an hour (`FRESH_SESSION_AGE`; `auth.session-not-fresh` otherwise), so a stolen session cannot add the thief's provider and keep the account after the owner changes the password. A provider account another user has is refused with `account_already_linked_to_different_user`.
  - The e2e tests replace the providers in process (`test/support/fake-oauth.ts`): their token and profile endpoints answer from `fetch`.
- Rate limits, all in Redis through the `RateLimiter` port (`shared/application`, fixed windows, one Lua round trip per hit), so they hold across instances. A refusal is 429 `request.rate-limited` with `Retry-After`.
  - Better Auth's limiter, per client address and path (`AUTH_RATE_LIMITS`): 20 sign-ins a minute (loose, for users behind one NAT), 3 sign-ups, 3 resends and 3 reset requests, 20 password changes (guesses at the current password from a stolen session), 100 for anything else.
  - The HTTP mount, per client address and identifier: 5 sign-ins a minute (`SIGN_IN_RULE`); and per identifier from every address together, 30 in 15 minutes (`SIGN_IN_ACCOUNT_RULE`), against guessing from many addresses at once. Anyone can spend the latter, so it is loose: the owner is held up for at most a window, and can still sign in with a provider.
  - `EmailThrottle`, per recipient and kind of email: one a minute and three an hour. Its requests still answer `200` as if the email went out, since a refusal would tell which addresses have an account. Every counted email reaches the owner, so whoever spends an address's quota hands its owner working links. It runs in the background with the send, so the answer takes the same time either way.
  - Socket handshakes and avatar uploads have limits of their own (see "HTTP and sockets" and "Profile and avatars").
  - Keys hold digests, never addresses or usernames. With Redis unavailable each instance counts in its own memory (`MemoryRateLimiter`, at most 100 000 counters), with one warning per outage: refusing every request would turn a Redis outage into a sign-in outage, and allowing every one would lift the limits on guessing passwords and sending emails. Tests give each app its own key prefix (`createTestApp({ rateLimitNamespace })`).
- Protect a route with `@UseGuards(AuthGuard)` and read the user with `@CurrentUser() viewer: Viewer` (`shared/presentation/auth.guard.ts`). Both rely on the `ViewerResolver` port in `shared/application`, which identity implements, so other contexts never import identity.
- Everything that touches play adds `RequirePlayer` (`@UseGuards(AuthGuard, RequirePlayer)`; a gateway handler needs only `RequirePlayer`, since sockets are authenticated on connect and on every command). Email and password sessions always pass, but an OAuth sign-in gets a session before it may play: the guard refuses 403 `auth.username-required` until the account has chosen its username, then `auth.email-not-verified` while the provider's email is not verified.
- Identity publishes `UserRegistered { userId, username, locale }` when an account has its username, at creation or when an OAuth account chooses it, and `UserVerified { userId }` when its email is verified: by the link, by a password reset, or when an OAuth provider vouches for it. `UserVerified` never comes before `UserRegistered`: an account without a username gets both when it chooses one. Other contexts import them from `modules/identity/index.ts`.
- The session cookie is `holdem.session_token`: HttpOnly, SameSite=Lax. In production it is `__Secure-holdem.session_token` and Secure, set for the one origin that serves both the web app and the api behind the reverse proxy.

## Profile and avatars

How players appear to others lives in `modules/profile`: the nickname (any script, 2–24 characters, not unique, unlike the username), the avatar and the language. A profile is created on identity's `UserRegistered`; `GET/PUT /api/profile…` is the player's own, `GET /api/profiles/:username` the public part.

- Avatars go to S3-compatible storage through the `ObjectStorage` port (`shared/application`; `S3ObjectStorage` in `shared/infrastructure/storage`). The browser uploads straight to storage, never through the api:
  1. `POST /api/profile/avatar/upload` with the content type answers a presigned POST for `uploads/<userId>/<uuid>`. Storage itself refuses more than 2 MB, another content type or another key. 10 requests an hour per player.
  2. The browser posts the file to storage.
  3. `PUT /api/profile/avatar` with the key checks the file, not what the browser said about it: its size, its first bytes (PNG, JPEG or WebP), and that it decodes within 40 megapixels (a decompression bomb fits in 2 MB). `AvatarImages` (sharp) decodes two pictures at a time per instance (`MAX_CONCURRENT_ENCODES`), the others wait, and re-encodes each as a 256×256 WebP, which drops its metadata (where a photo was taken) and anything hidden after the image. It is stored once under `avatars/<userId>/<uuid>.webp`, cached for good (`immutable`), and the replaced avatar is deleted. The upload is deleted whatever happens. A player confirms one upload at a time per instance (`profile.avatar-busy`), 20 an hour, so repeating a confirm cannot queue up decodes. `DELETE /api/profile/avatar` goes back to none.
- Only `avatars/*` is public (`infra/s3/avatars-policy.json`); pending uploads are private and expire after a day (`avatars-lifecycle.json`). The bucket allows uploads from `WEB_ORIGIN` (CORS); `infra/s3/init.sh` sets all three, locally and in CI. Responses carry `avatarUrl`, built from `S3_PUBLIC_URL`, ready for a CDN. A player without one gets an identicon the web app draws from the username; provider pictures are not used, so no third party learns who looks at a profile.

## Table

The table is an event-sourced decider in `modules/table/domain` (ADR-002): `decideTable(command, state)` answers the events a command produces or the `DomainError` it breaks (`table.*`), and `evolveTable` / `replayTable` fold events into the state. It is pure, like the hand decider in `@holdem/engine`, which only the table calls.

- `TableConfig`: blinds, a buy-in range in big blinds (chips are unlimited, ADR-009), 2–9 seats, turn time (5–120 s), time bank (0–600 s), the absence policy (reconnect grace 0–600 s, a disconnected player's turn 1–120 s, a seat lost after 1–3600 s or 1–100 hands sitting out; `DEFAULT_ABSENCE_POLICY` is 120 s, 5 s, 600 s and 3 hands) and visibility. `OpenTable` checks it.
- A player sits down waiting for the big blind (`waiting-for-big-blind`), and is dealt in once it reaches the seat. Sitting back in after sitting out waits for it again, so sitting out dodges no blind; a player who sat out during a hand they are still in is `active` again.
- Leaving during a hand the player is dealt into marks the seat `leaving` until the hand ends; otherwise the seat is freed at once. Rebuys (an empty stack, a full buy-in) and top-ups (up to the maximum buy-in) wait until the player's hand ends.
- At most 50 users watch a table (`MAX_SPECTATORS`); a spectator who sits down stops watching. `CloseTable` lets everyone leave first and is refused during a hand.
- `tableDecider` bundles `decideTable`, `evolveTable` and the initial state for the event-sourcing helpers; the streams live in `table_events` (see "Event store").
- `decideTable` tests set the running hand (`state.hand`) and stacks directly through `given(history, { hand, stacks })` in `test/support/table.ts`.

### Hands

`decideGame(command, { table, hand })` (`domain/game.ts`) runs hands on top of `decideTable`: it is the only caller of the engine's hand decider (Context Map), and answers the events for both streams, `table-<tableId>` and `hand-<handId>`.

- `StartHand { handId, deck, buttonDraw }` deals the next hand when no hand is running and two players are ready (`active` or `waiting-for-big-blind`; sitting-out and leaving players are not dealt in). The positions follow the dead button rule from the last hand (`nextHandPositions`); before the first hand, or when the rule leaves fewer than two to deal in, the table starts over with every ready player dealt in and the button on the seat `buttonDraw` picks (`firstHandPositions`). Waiting players dealt in become `active`, then `HandScheduled` records the hand and its positions, and the engine's `StartHand` opens the hand's stream.
- `Act`, `ShowCards` and `MuckCards` come from a user and go to the hand on their seat (`table.not-in-hand` for a player not dealt in, `table.leaving-seat` for one who left); `Timeout { handId, seat }` comes from the turn timer and is refused for any other hand (`table.no-hand`). The hand's own refusals pass through as `HandRuleError`, with its `hand.*` code and params.
- What follows on its own is added to the same decision: a leaving player folds on their turn (mucks at the showdown), at once if it is their turn already. When the hand ends, `HandSettled` gives every player dealt in their stack from `HandEnded`; then the leaving players' seats are freed (`SeatLeft`) and players left with no chips sit out, to rebuy and sit back in. A player who sat out during the hand plays it out and is not dealt the next.
- `handReady(table)` says whether a hand can start now.
- **Provably fair deals** (ADR-008). `StartHand` carries the commitment, the hex SHA-256 of the server seed the deck comes from, and `DeckCommitted { handId, commitment }` publishes it before the deal. Once the hand has ended, `RevealDeck { handId, serverSeed }` publishes the seed (`DeckRevealed`), and only if it hashes to the commitment (`table.deck-mismatch` otherwise). A second reveal, or one for a hand still running, is refused. There are no client seeds: chosen when a player sits down, before the server commits, they would bind nothing.
- **The turn clock** (`decideGame(command, state, now)`, `now` in epoch ms). Whenever a player gets a new turn (someone else is to act, or the same player again after acting), `TurnStarted { handId, seat, startedAt }` starts it. The turn lasts `turnSeconds`; a player who acts later pays the overrun out of their time bank (`TimeBankUsed`). `Timeout { handId, seat }` is accepted only for the current turn once its time and the bank are both out (`turnDueAt`); it spends what is left of the bank and checks if the player can, otherwise folds (mucks at the showdown). An early, stale or repeated timeout is refused (`table.timeout-not-due`, `table.no-hand`). The time bank (`timeBankSeconds`) is full when a player sits down and never refills while they keep the seat: leaving and sitting down again resets it.
- **Absences** (POK-85), on the same clock. `Disconnect { userId }` comes once a user's last connection to the table closes: a player keeps the seat (`PlayerDisconnected { seat, at }`), a spectator stops watching. While disconnected, a player's turn ends `disconnectedTurnSeconds` after it started or after the disconnect, whichever is later (`turnDueAt`), so the table is not held up. `Reconnect { userId }` brings them back (`PlayerReconnected`); within the grace they play on as before. After every command, the policy applies what is due: a player still away `reconnectGraceSeconds` after the disconnect sits out; one who has sat out for `sitOutSeconds`, or `sitOutHands` hands dealt without them, leaves the seat (at the end of a hand they are still in, folding on their turn). Every change to `sitting-out`, whatever the reason (asked, busted, away), is followed by `SitOutStarted { seat, at }`, the sit-out clock; hands missed are counted when one is dealt. `ExpireAbsences` applies the policy alone, and is refused when nothing is due (`table.absence-not-due`). A player back after the grace stays sitting out until they sit in.

The application side (`modules/table/application`):

- Every table runs in a `TableRuntime` of its own: a mailbox takes its commands one at a time, in the order they came, so commands for a table never interleave. It folds the table's streams once and keeps the state in memory; each decision is appended to both streams in one transaction (`saveGame`, `EventStore.appendToStreams`) at the version it was made on. When another writer got there first (`ConcurrencyError`), it reloads and decides once more, then gives up. A failed append makes it reload before the next command.
- **One instance runs a table** (ADR-004). `TableRuntimeRegistry` runs it where its lease is (`TableLeases`, `RedisTableLeases`). The lease is the key `table:<id>:owner` = `<instanceId>:<epoch>`, `SET … PX TABLE_LEASE_TTL_MS` (10 s by default). The epoch comes from `table:<id>:epoch` and is pushed past the stream's last stored epoch, should the counter be lost. Lease keys start with the database's name, so environments that share one Redis (the e2e tests) never take each other's tables.
  - The first command for a table nobody holds takes the lease on the instance it reached: the streams are folded, the runtime resumes from them and arms whatever is due (the deal, the turn timer, the absence timer).
  - Leases are renewed every third of their time to live. If Redis answers that a lease is gone, its runtime stops at once (`abandon`). If Redis does not answer, runtimes go on running, since no other instance can take a table over meanwhile either.
  - Every append carries the lease epoch. An instance that lost a table and still writes to it is fenced off (`FencedError`): its runtime stops, and the command is sent to the new holder.
- **Commands go to the holder.** `execute`, `dealNextHand` and `viewFor` run locally when the table runs here. Otherwise they go to the holder through `TableRequests` (`RedisTableRequests`: pub/sub on `table-requests:<instanceId>`, replies on `table-replies:<instanceId>`), and errors come back with their kind, code and params.
  - Answers carry no hand events, because those hold the deck. `execute` answers once the command is stored, `dealNextHand` whether a hand was dealt, and `viewFor` the redacted `TableView`.
  - A request to an instance nobody listens for fails at once; one unanswered within 5 s fails with `table.unavailable`. A table that moved meanwhile (`table.moved`) is sent once more to its new holder.
  - While a table changes hands, a command may still be refused (`table.moved`, `table.unavailable`, or a version conflict with the last writes of the old holder), and the client sends it again.
- **Takeover** (POK-80). Every lease ever taken and not released is in the set `tables:leased`. Every lease time to live, each instance takes over the tables in that set whose lease ran out (`orphans`). When an instance starts, it also takes over the tables whose last hand never ended (`UnfinishedTables`, a scan of `table_events`), a random moment within half a lease after the start. The runtime picks up from the streams: a hand left mid-turn is timed out, an ended one is followed by the next deal. A takeover is logged as `table taken over`, with the time since the table's last event and how long the takeover took.
- A runtime idle (nothing queued, no deal, turn or absence due) for 10 minutes is dropped and its lease released; the next command takes it again. On shutdown, queued commands finish and every lease is released, so another instance can take the tables at once. `pnpm start:two` runs two instances to try it.
- `ExecuteTableCommand(tableId, command, metadata)` runs any command but `StartHand` and answers once it is stored. `StartNextHandCommand(tableId)` deals the next hand and answers whether it did. Both run on the table's holder.
- The runtime times out the player to act: after every change, and when it loads a table, it sets one timer for `turnDueAt` that queues `Timeout` in the mailbox like any command. A timer that lost the race with the player's action is refused by the table and ignored. A runtime with a turn running is never idle, so it is not dropped mid-hand.
- It keeps a second timer, the same way, for the next reconnect grace or sit-out to run out (`absenceDueAt`), which queues `ExpireAbsences`. A runtime with someone away is not idle either.
- `TablePresence` (port; `RedisTablePresence`) knows who follows each table across instances: a sorted set per user and table in Redis, `table-presence:<tableId>:<userId>`, of connection ids scored by when they run out. Each instance refreshes the connections it holds every 20 s for 60 s, so those of an instance that died run out on their own; each change is one script, so of two last tabs closing at once on two instances, exactly one sees none left. `ConnectToTableCommand` records a connection and, when it is the user's first, sends `Reconnect`; `DisconnectFromTableCommand` forgets one and, when it was the last, sends `Disconnect`. The table's refusals (a user who was not away, or has nothing there) are expected and dropped. While Redis cannot be reached, nobody is reported back or gone: players then play on under the usual turn timer, rather than being sat out because the outage hid their tabs.
- After each command that leaves the table ready for a hand, the runtime deals one `TABLE_HAND_PAUSE_MS` later (3 s by default, so players see the result), in its own mailbox, with a new hand id and the `DeckProvider`'s deck and button draw.
- Each change is published in this process as `TableChanged { tableId, versions, events, state }` on the `EventBus`, in the order the table took the commands. `versions` is where the streams are after it: the table's, and the current or last hand's (`TableVersions` in `@holdem/shared/realtime`). Between hands the game keeps the last hand, so its stream and its result stay known. Hand events and `state.hand` carry the deck: only redacted views ever leave the api.
- `GetTableViewQuery(tableId, userId)` reads the table through its runtime on the holder, after the commands queued before it, and answers the `TableView` that user may see (`application/table-views.ts`).
- `POST /api/dev/tables` (`DevTablesController`, contract in `@holdem/shared/contracts/table`) opens a table without the lobby: a 1/2 table for six unless the body says otherwise, answering `{ tableId }`. `TableModule.forRoot(config)` registers it outside production only, so a production build has no such route (404).

### Realtime

`TableGateway` (`presentation/table.gateway.ts`) serves the `/table` namespace of `@holdem/shared/realtime`:

- Every socket joins its user's room, `user:<userId>`, when it connects. `join` adds it to the table's room, `table:<tableId>`, records the connection (a disconnected player is back before the snapshot is read, so it shows them back), and answers the table as the user sees it. A user without a seat watches as a spectator (`JoinAsSpectator`, at most 50), whatever `as` says. The room is joined before the snapshot is read, so a batch sent in between is older than the snapshot and the client drops it. A first `join` that fails takes all of that back; a failed resync keeps following.
- Commands (`take-seat`, `act`, …) need `RequirePlayer`, become `ExecuteTableCommand`s with the user as metadata, and are answered `{ ok: true, data: {} }` once the table took them, or with the rule they broke. Payloads are validated first (400 `request.invalid`), and nothing invalid reaches the table.
- Each `TableChanged` goes out as `events` batches, redacted for each audience (`eventsBatchFor`, the engine's `redactEvent`): every seated player, and one who just left, gets their own batch in their user room; the rest of the table's room gets the spectators' batch. No other batch is sent, so nobody receives another player's hole cards before they are shown, nor the deck or a burn card.
- A client that misses a batch notices it with `followsVersions` and sends `join` again for a snapshot.
- The turn clock is public: after a change that starts or ends a turn, or that disconnects or brings back a player, everyone following the table and every player gets `timer { tableId, timer }` with absolute server times (`turnEndsAt`, then `timeBankMs` of bank), or `timer: null`. Snapshots carry the same `timer` and the server's clock (`serverTime`), so a client can correct for clock skew.
- `leave`, or a socket disconnecting, stops it following the table; once none of the user's sockets on any instance does, a player is disconnected and a spectator stops watching (`TablePresence`).
- `SocketRateLimit` (`shared/presentation/realtime`) refuses more than 10 commands a second per socket with 429 `request.rate-limited`, before validation.
- Rooms go through the Redis streams adapter, so they reach sockets on every instance (see "Realtime"). Commands reach the table's holder wherever the socket is, and its changes are broadcast from there.

- `SeededDeckProvider` shuffles each hand from a fresh 32-byte server seed out of the CSPRNG and keeps the seed in `table_hand_decks`, server-only, like the deck in the hand's stream. Right after the command that ends a hand, the runtime takes the seed out (`reveal`, which sets `revealedAt`) and queues `RevealDeck` before the next deal. So no payload carries the seed before the hand has ended.
- `GET /api/hands/:handId/fairness` (`HandsController`, no session needed) answers `HandFairnessResponse`: the commitment, the revealed seed and the dealt cards (the deck's first cards, burns included, in order), all `verifyDeck` needs. While the hand runs it answers 409 `table.deck-not-revealed`; for an unknown hand 404 `table.hand-not-found`. Snapshots carry the current or last hand's commitment (`fairness`).
- `test/table-hands.e2e-spec.ts` plays 100 random hands at a six-seat table through the command bus, with players sitting out, leaving, busting and rebuying, and checks every chip after each hand; `HOLDEM_TABLE_SEED` replays a run.

## Lobby

The lobby owns which tables there are and what they were created with; the table context runs them (Context Map, customer–supplier). `modules/lobby`:

- Stake presets (`domain/stake-presets.ts`): micro 1/2, low 5/10, mid 25/50 and high 100/200, each with a buy-in of 40–100 big blinds. `GET /api/lobby/presets` lists them, from the smallest.
- `POST /api/lobby/tables` (`AuthGuard`, `RequirePlayer`) takes `CreateTableRequest` (`@holdem/shared/contracts/lobby`): a name (1–40 characters once trimmed), a preset, 2–9 seats, a visibility and an optional turn time (5–120 s, 20 by default). It answers `{ tableId }`, and the table can be joined at once on `/table`.
  - `CreateTableHandler` validates the settings (`lobby.invalid-name`, `lobby.unknown-preset`) and stores the row in `lobby_tables` first. A player keeps at most 3 open tables (`lobby.too-many-tables`). The check and the insert run under a Postgres advisory lock on the creator, so two tables created at once cannot both slip under the limit.
  - It then opens the table through the table context's public API (`ExecuteTableCommand` with `OpenTable`, from `modules/table/index.ts`), with the preset's stakes, a 30 s time bank and the default absence policy. A table that could not be opened leaves no row behind.
- **Private tables** (POK-96). A private table gets an invite code: 8 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no look-alikes), drawn with `randomInt`, unique in `lobby_tables`. Lowercase is accepted, and the web link is `/{locale}/t/{code}`. It may have a password of 4–64 characters, stored as a scrypt hash (`ScryptPasswordHasher`: N = 2^17, r = 8, p = 1, salted, compared in constant time). A public table refuses one (`lobby.password-needs-private`).
  - `GET /api/lobby/invites/:code` shows the table an invite leads to and whether it asks for a password. An unknown code is `lobby.invite-not-found`, which says nothing about passwords.
  - `POST /api/lobby/invites/:code/redeem { password? }` grants the user access (`TableGrants`, `lobby:grant:<tableId>:<userId>` in Redis). A grant lasts a day after it was last used, and every access check extends it. A wrong password is `lobby.wrong-password`; tries are limited to 5 per 15 minutes per user and table (429).
  - `POST /api/lobby/tables/:tableId/invite`, by the creator only (`lobby.not-creator`), gives the table a new code: the old link stops working, and the grants stay.
  - **Who may join** is the lobby's call (`CanJoinTableQuery`, in the shared kernel, so the table context asks without depending on the lobby). Anyone may join a public table; a private one takes its creator and whoever redeemed its invite. A table the lobby does not list (a dev table) is open. The `/table` gateway asks before `join` and `take-seat`, and refuses with `table.access-denied`.
- **The lobby's read model** (POK-97). The table context publishes `TableSummaryChanged` (`table.summary-changed`, not broadcast) after every change to a table's players or status: who sits where, open or closed, and how many hands ended in that change. The table holder publishes it once, after the append.
  - `TableSummaryChangedHandler` applies it to the table's `lobby_tables` row: `players` (jsonb), `handsPlayed` and `status`. A closed table stays closed, and tables the lobby does not list are ignored. Then it publishes `LobbyTableChanged` in-process.
  - `GET /api/lobby/tables?presetId&maxSeats&hasFreeSeat` lists the open public tables, fullest first, then newest, at most 100. Private tables are never listed. `GET /api/lobby/my-tables` lists the open tables I created or sit at, private ones included, with the invite code of those I created.
  - `/lobby` namespace (`LobbyGateway`): `watch` joins the room `lobby` and answers the list (the room first, so nothing is missed in between); `unwatch` leaves. `LobbyTableChanged` goes out as `table-upserted`, at most once per table every 500 ms (the last change always goes out), or `table-removed` at once when a table closes. Private tables never go out.
  - Changes are emitted on the instance running the table, and the Redis adapter carries them to watchers on every instance, so one throttle per table holds for all.
- **Closing tables** (POK-98). The read model marks a table empty from when it is created, or from its first summary without players, until someone sits (`emptySince`).
  - Every minute, each instance's `IdleTablesScheduler` sends `CloseIdleTablesCommand`. It asks the table context to close (`CloseTable`) every table empty for 15 minutes, or 60 minutes for a private one.
  - The table's summary then closes the lobby row and removes the table from the lobby. A table the table context already closed is marked closed in the lobby; one it would not close is tried again at the next sweep. Closing is idempotent, so all instances sweep.
  - `POST /api/lobby/tables/:tableId/close` lets the creator close their table once nobody sits at it (`lobby.not-creator`, `lobby.table-not-empty`).
  - A closed table refuses joins (`table.closed`), no longer counts against its creator's limit, and its runtime is dropped at the registry's next sweep instead of after 10 idle minutes.
- `POST /api/dev/tables` stays for trying tables out without the lobby, outside production only.

## Social

Who plays with whom (`modules/social`). Players are shown by their cards (username, nickname, avatar). The profile context answers the shared-kernel queries in `shared/application/player-directory.ts`: `GetPlayerCardsQuery`, `FindPlayerQuery` and `SearchPlayersQuery`. So social keeps only user ids, and never a copy of profiles.

- **Friend requests and friendships** (POK-103). The rules are pure functions over a `Standing`, which is where two players stand as seen from one of them (`domain/friendship.ts`). The rules are:
  - no requests to oneself, to a friend, or twice;
  - asking someone who already asked you befriends you both;
  - at most 200 friends each, and at most 20 of one player's requests waiting for an answer (`FRIEND_LIMITS` in `@holdem/shared/contracts/social`).
- `FriendshipRepository.locked(userIds, work)` runs the decision and its writes in one transaction, under Postgres advisory locks on both players, taken in id order. Two requests at once cannot slip under a limit, and two players asking each other at once become friends once. A friendship is two rows in `social_friendships`, one from each side. A waiting request is a row in `social_friend_requests`, and the row is deleted once the request is answered or cancelled.
- Routes (all need a session; changes and search need `RequirePlayer`):
  - `GET /api/friends`;
  - `DELETE /api/friends/:userId`;
  - `GET /api/friend-requests/incoming|outgoing`;
  - `POST /api/friend-requests { username }`, which answers `requested` or `befriended`, at most 30 an hour per player;
  - `POST /api/friend-requests/:userId/accept|decline`;
  - `DELETE /api/friend-requests/:userId`, which cancels the request;
  - `GET /api/players/search?q=`: usernames starting with `q`, 10 at most, without the searcher, each with its `relation`; at most 60 a minute per player. `profile_profiles.username` has a `text_pattern_ops` index for it.
- Declining and removing tell nobody. A new request publishes the integration event `FriendRequestSent` (`social.friend-request-sent`), and a new friendship publishes `FriendshipCreated` (`social.friendship-created`). Both are published once the transaction has committed, for realtime notifications.
- **Presence** (POK-105), on the `/social` namespace (`SocialGateway`). A player is online while any socket of theirs is connected there, on any instance.
  - `RedisPlayerPresence` keeps the following keys, all prefixed by the database's name:
    - a sorted set per player of connection ids, scored by when they run out (60 s, refreshed every 20 s by the instance holding them);
    - a set of the players shown online;
    - who sits at each table, and the tables each player sits at, from `TableSummaryChanged`.
  - Each change is one Lua script.
  - The first connection shows the player online. After the last one closes, `PresenceSettler` waits 5 s (`OFFLINE_GRACE_MS`) before settling, so a reload, or a reconnect to another instance, shows nothing.
  - Every instance sweeps the players shown online every 30 s, for connections that ran out when their instance stopped. Settling is atomic, so a player goes offline once.
  - `presence-changed` goes to each online friend's `user:<id>` room, with the presence as that friend may see it: `offline`, `online`, `at-table { tableId }`, or `playing`. A friend sees `playing` for a table they may not join (`CanJoinTableQuery`): a private table whose invite they have not redeemed. A player offline shows offline wherever they sit.
  - `friends-presence` answers every friend's presence. Changes reach a socket from its connection on, since it joins its room before the player is shown online.
  - `FriendRequestSent` goes out as `friend-request-received`. `FriendshipCreated` goes out as `friend-added` to both players, followed by their presence.
  - While Redis is down, nobody comes online or goes offline.
- **Table invites** (POK-109).
  - `POST /api/table-invites { friendId, tableId }` invites a friend to a table the player may join themselves. The lobby answers this through the shared-kernel `GetInvitableTableQuery`, which finds the table open, public or with access. A stranger is `social.not-friends`, and a table out of reach is `social.table-not-found`. Each player may send one invite a minute per friend and table (429).
  - `RedisTableInvites` keeps the invite for 10 minutes, in a sorted set per invitee scored by expiry. The friend hears `table-invite-received` on `/social`.
  - `GET /api/table-invites` lists the waiting invites, without those to tables closed or out of the sender's reach.
  - `POST /api/table-invites/accept { inviterId, tableId }` takes the invite out (once, atomically) and answers `{ tableId }`. For a private table it grants access through the lobby (`GrantTableAccessCommand`), as a redeemed invite code would, with no password.
  - Declining (`/decline`) tells nobody.
  - Access is granted only on accepting, so an invite that runs out grants nothing.

## Chat

Each table's chat (`modules/chat`, POK-104) lives on its own namespace, `/chat` (`ChatGateway`), so the table context knows nothing of it.

- `join { tableId }` takes access to the table, as joining the table does (`CanJoinTableQuery`, otherwise `chat.access-denied`). It joins the room `table:<id>` of `/chat` first, then answers the last messages, oldest first, so none falls in between.
- `send { tableId, text }` needs a socket that joined that chat (`chat.not-joined`) and a verified player (`RequirePlayer`, `auth.email-not-verified`). Players and spectators can both send, since the web app follows a table and its chat together. The text is trimmed and holds 1–200 characters (`chat.invalid-length`).
- **Moderation** (POK-106).
  - A message is cleaned, then measured: control and format characters are dropped (the zero-width joiner stays, for emoji sequences), and spaces are collapsed.
  - Profanity is masked with one asterisk per character (`maskProfanity`), not refused.
  - Saying the same thing again, in any case, within 30 s of one's last message at the table is `chat.repeated`.
  - A player may send 5 messages per 10 s, across tables and instances (`RateLimiter`, `chat.too-fast`, 429).
  - Messages carry `id`, `userId` and `tableId`, for reports later.
- **Mute list** (POK-107). `chat_mutes` in Postgres records whom each player muted, so the list is the same on every device.
  - Routes: `GET /api/chat/mutes` (cards, latest first), `PUT` and `DELETE /api/chat/mutes/:userId`. Both changes are idempotent; muting oneself is `chat.mute-self`, and an unknown player is `chat.player-not-found`.
  - The `join` ack carries the muted ids too. The client hides those players' messages: the server sends everyone the same messages and filters nothing per recipient.
- **The profanity filter** (`shared/domain/profanity.ts`) is a curated list of Russian and English roots, kept in the repo; the libraries tried missed common disguises or masked plain words.
  - Each word is read twice: with look-alike letters, digits and symbols taken as Cyrillic, and taken as Latin. This catches mixed scripts (`xуй`) and leetspeak (`sh1t`).
  - Separators inside a word (`х.у.й`) and repeated letters (`fuuuck`) are dropped.
  - Single letters typed apart (`f u c k`) are read together.
  - Anchors and exceptions keep plain words alone (`хлебать`, `застрахуй`, `Scunthorpe`, `cocktail`).
  - Nicknames use the same filter, refused with `profile.nickname-profane`.
- A message `{ kind: "player", id, tableId, userId, nickname, text, at }` goes to the room through the Redis adapter, so it reaches every instance. The ack answers the same message.
- **The dealer** speaks from the table's integration event `PotsAwarded` (`table.pots-awarded`), which the table holder publishes for each hand with the winners of each pot by user. The dealer's messages are `{ kind: "dealer", key: "pot-won", params: { userId, nickname, amount, category? } }`, and the client words them in its language.
- **History.** `RedisChatHistory` keeps the last 50 messages per table in a capped list, under keys prefixed by the database's name. It is not kept in Postgres: chat is for the table's lifetime. Each message pushes the list's expiry back to 24 h. Once the table's summary says it closed, the chat goes an hour later.

## HTTP and sockets

- Every REST route lives under `/api` (`API_PREFIX` from `@holdem/shared`), so production can serve the web app and the api from one origin behind a reverse proxy (`/api/*` and `/socket.io/*` → api). Requests outside it get a 404 problem too.
- `configureApp` (shared by `main.ts` and the e2e tests) sets the global prefix, the security headers (helmet), CORS for `WEB_ORIGIN` with credentials (used in development, where web and api are two origins), `trust proxy`, a 16 KiB limit on JSON bodies and the socket.io adapter.
- A request that changes state (anything but GET, HEAD and OPTIONS) from a browser page on another origin than `WEB_ORIGIN` is refused with 403 `request.cross-origin`, before any route sees it: cookies ride along regardless of CORS (login CSRF). Requests without `Origin` are not from a browser and pass. AppModule applies it, and the auth mount after it, because middleware of global modules runs first and the order must be: logger, origin check, auth.
- socket.io refuses a connection whose `Origin` is not `WEB_ORIGIN`: CORS alone would let a page on another origin open a socket with the visitor's cookies (cross-site WebSocket hijacking). Clients without an `Origin` are not browsers and are let through. A message larger than `MAX_MESSAGE_BYTES` (64 KiB) closes the connection.
- Each client address may hold 20 open connections per instance (`MAX_CONNECTIONS_PER_ADDRESS`, room for a household behind one router) and open 60 a minute across instances (`HANDSHAKE_RULE`), since every handshake looks its session up. The address follows `TRUST_PROXY`, like Express's.
- Sockets carry the session of their handshake cookie. `authenticateSockets` (`shared/presentation/realtime/socket-session.ts`) runs when a client joins a namespace; the composition root hands it to `SocketIoAdapter`, so the adapter knows no identity code. It resolves the viewer through `ViewerResolver` into `socket.data.viewer`. Without a session the viewer is null, and only `PUBLIC_NAMESPACES` (the root, for `ping`) let it in; elsewhere the client gets `connect_error` with a 401 problem. A failed lookup refuses with a 500 problem.
- A socket outlives its session unless something checks: `@RealtimeGateway` re-reads the session before every command (`SocketSessionGuard`), and every signed-in socket is re-checked each minute while idle (`SESSION_RECHECK_MS`), since it still receives what its viewer may see. When the session is gone (signed out, expired, revoked by a password reset), the socket gets `session-expired` and is disconnected. The re-read also refreshes the viewer, so `RequirePlayer` in a gateway sees the email as it is now. `@CurrentUser()` works in gateway handlers too.

## Admin

A limited admin (`modules/admin`, POK-114). The full admin panel comes after the MVP.

- **Role.** `identity_users.role` is `user` or `admin`. It is a Better Auth additional field with `input: false`, so no request can set it, and it comes with the session as `Viewer.role` and `GET /api/me`'s `role`.
  - It is granted only from the command line: `pnpm --filter api user:role <username or email> <admin|user>` (`scripts/user-role.mjs`), which also writes the change to the audit. The app has no endpoint for it.
  - The role is read with the session on every request, so taking it away takes effect at once.
- **`AdminGuard`** (`shared/presentation`), after `AuthGuard`, refuses everyone but admins with 403 `auth.admin-only`.
- **Routes.** `/api/admin` serves:
  - `GET tables`: every open table, private ones too, with its creator and players as cards;
  - `POST tables/:tableId/close`;
  - `GET users?q=`: an email, or the beginning of a username; at most 20 accounts, each with its profile's nickname and the open tables it sits at;
  - `POST users/:userId/revoke-sessions`, answering how many sessions ended;
  - `GET audit`: the latest 100 actions.
- **Closing by force.** `POST tables/:tableId/close` sends `ForceCloseTable` to the table through its public API, wherever the table runs.
  - A running hand is called off: the engine's `CancelHand` gives every player back what they put in, antes, blinds and bets, in pots or not (`HandCancelled`). The hand is then settled, and the table closes as `CloseTable` does.
  - The deck of the cancelled hand is still revealed, since a closed table accepts `RevealDeck`.
  - The lobby, presence and chat follow from the table's summary, as for any closed table.
- **Revoking sessions.** Identity deletes every session of the account. Its REST requests fail at once, and its sockets at their next command or within a minute.
- **The admin context owns only `admin_audit`.** It asks the others through the shared kernel: `FindAccountsQuery` and `RevokeSessionsCommand` (identity), `ListOpenTablesQuery` (lobby) and `GetPlayerCardsQuery` (profile).
  - Every action that succeeded is logged (`admin action`) and recorded in `admin_audit`: admin, action, target, details and time. Entries are never edited or deleted.
  - Changes made from the command line have no admin.

## Security

The checks the api runs, and what it leaves to others (POK-115). Each line points to where it is described.

- **Sessions and CSRF.** The session cookie is HttpOnly and SameSite=Lax, and Secure with the `__Secure-` prefix in production. A state-changing request whose `Origin` is not `WEB_ORIGIN` is refused (`request.cross-origin`), before any route sees it. Sockets check the session on connect, on every command and every minute while idle. See "Identity and sessions" and "HTTP and sockets".
- **CORS.** Only `WEB_ORIGIN`, with credentials, for both REST and socket.io. socket.io also refuses another `Origin` itself (cross-site WebSocket hijacking).
- **Headers.** The api uses helmet. The web app sends its own (`apps/web/src/shared/config/security-headers.ts`):
  - a CSP by allowlist, with `frame-ancestors 'none'`;
  - HSTS outside `next dev`;
  - `nosniff`, a referrer policy and a permissions policy.
- **Input.** Every request body, query, route parameter and socket payload is parsed with a shared zod contract (`@ValidBody`, `@ValidQuery`, `@ValidParam`, `@ValidPayload`). `test/architecture/validated-input.spec.ts` fails if a handler takes input through Nest's unchecked decorators (`@Body`, `@Query`, `@Param`, `@MessageBody`, …). JSON bodies stop at 16 KiB and socket messages at 64 KiB.
- **Abuse limits.** All per player unless noted, all in Redis so they hold across instances:

  | What | Limit |
  | --- | --- |
  | Sign-in, sign-up, emails | see "Identity and sessions" |
  | Socket handshakes | 60 a minute per address |
  | Socket commands | 10 a second per socket |
  | Table creation | 20 an hour, and 3 open tables |
  | Invite code lookups and redemptions | 30 a minute |
  | Table passwords | 5 tries per 15 minutes per table |
  | Friend requests | 30 an hour |
  | Player search | 60 a minute |
  | Table invites | 1 a minute per friend and table |
  | Chat | 5 messages per 10 s, no repeats within 30 s |
  | Avatar uploads | 10 an hour |
  | Avatar confirms | 20 an hour, one at a time |
- **Secrets and errors.**
  - Logs redact secret-looking keys at any depth, and never hold headers, bodies or query strings.
  - An unexpected error answers `500 internal` with no message or stack; the stack goes to the log only.
  - Production refuses to start with the public development secrets from `.env.example`: `AUTH_SECRET`, `S3_SECRET_ACCESS_KEY` and the database password. It also refuses `TRUST_PROXY=true`.
- **Leaks.**
  - Hand events and `state.hand` carry the deck, and only redacted views leave the api (redaction tests in the engine and the gateway).
  - The server seed stays in `table_hand_decks` until the hand has ended, and a shorter seed than 16 bytes is refused (`deriveHandSeed`).
  - Table, hand and user ids are random UUIDs.
  - Private tables are never listed. Presence names a table only to friends who may join it. Invite codes take 31⁸ tries to guess, against 30 lookups a minute.
- **Dependencies.**
  - CI fails on a moderate or worse advisory (`pnpm audit`) and on unmet peers.
  - The two ignored advisories reach only dev tools (steiger's zod 3, eslint's minimatch); `pnpm-workspace.yaml` says why and when to drop them.
  - Dependabot proposes updates weekly, and CI actions are pinned by SHA.

### Threat model

STRIDE, for what a player could do to others or to the service.

| Threat | Example | Mitigation |
| --- | --- | --- |
| **S**poofing | Acting as another player; a page on another site using the player's cookies | Sessions in HttpOnly cookies, origin checks on REST and sockets, the session re-read before every socket command |
| **T**ampering | Forged table commands, out-of-turn actions, a rigged deck | Commands are validated, then decided by the engine on the server; the deck is committed before the deal and verifiable after (ADR-008) |
| **R**epudiation | "I never folded" | Every table and hand event is stored in order with its metadata (event store); admin actions are audited (POK-114) |
| **I**nformation disclosure | Other players' hole cards, the deck, private tables, which emails have accounts | Per-viewer redaction, the seed revealed only after the hand, private tables hidden from listings and presence, emails answered the same whether an account exists |
| **D**enial of service | Floods of sign-ins, emails, sockets, chat, tables or invite guesses; decompression bombs | The limits above; body and message sizes; the pixel limit and per-player confirms for avatars; Redis outages fall back to per-instance limits |
| **E**levation of privilege | Playing before verifying the email; joining a private table without access; admin routes | `RequirePlayer`; access checked before `join` and `take-seat`; admins by role, set outside the app (POK-114) |

Known and accepted:

- **The web CSP keeps `'unsafe-inline'` for scripts.** A nonce on every response would make every page dynamic and give up Cache Components' static rendering. The allowlist still stops loading code from other hosts and sending data to them.
- **`SIGN_IN_ACCOUNT_RULE` can be spent by anyone** who knows a username. It is loose (30 in 15 minutes), and the owner can still sign in with a provider.
- **The verification link signs its opener in.** Someone could send a victim the link of an account they own, which is login CSRF. Opening it only signs the victim into that other account, which holds nothing of theirs: chips are virtual. Checking who opens the link is not possible before a session exists.
- **`/api/health/ready` is public.** It names the dependencies and whether they answer, for the load balancer. The reverse proxy may keep it internal.
- **A hand's dealt cards are public once the hand ends** (`GET /api/hands/:handId/fairness`), folded hole cards included, since verifying the shuffle needs them. Hand ids reach only those who saw the hand.

## Load

`tools/loadtest` (POK-116) plays many tables with socket bots across two instances, and its README holds the latest results.

- 20 tables of 6 played 1,103 hands in 10 minutes without an error.
- A turn's round trip had a p95 of 6.2 ms, and fan-out to the other players 6.4 ms. Each instance used about 8 % of a core and 330–380 MB.
- With one instance killed, every table played on in under 14 s: twice the lease TTL at most.

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
- Unit-test domain code with plain inputs and outputs (Given/When/Then for deciders). Domain specs may use `test/support`; the code itself may not.
- e2e tests boot the real app through `createTestApp()` from `test/support`, configured from `.env.example`.
- Tests that touch the database call `createTestDatabase()`: it creates a fresh `holdem_test_*` database with every migration applied, and `drop()` removes it. Pass its `url` to `createTestApp({ config: { database: { url } } })`. They need the services from `pnpm infra:up`.
