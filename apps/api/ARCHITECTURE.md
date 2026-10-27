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
  3. `PUT /api/profile/avatar` with the key checks the file, not what the browser said about it: its size, its first bytes (PNG, JPEG or WebP), and that it decodes within 40 megapixels (a decompression bomb fits in 2 MB). `AvatarImages` (sharp) decodes two pictures at a time per instance (`MAX_CONCURRENT_ENCODES`), the others wait, and re-encodes each as a 256×256 WebP, which drops its metadata (where a photo was taken) and anything hidden after the image. It is stored once under `avatars/<userId>/<uuid>.webp`, cached for good (`immutable`), and the replaced avatar is deleted. The upload is deleted whatever happens. `DELETE /api/profile/avatar` goes back to none.
- Only `avatars/*` is public (`infra/s3/avatars-policy.json`); pending uploads are private and expire after a day (`avatars-lifecycle.json`). The bucket allows uploads from `WEB_ORIGIN` (CORS); `infra/s3/init.sh` sets all three, locally and in CI. Responses carry `avatarUrl`, built from `S3_PUBLIC_URL`, ready for a CDN. A player without one gets an identicon the web app draws from the username; provider pictures are not used, so no third party learns who looks at a profile.

## HTTP and sockets

- Every REST route lives under `/api` (`API_PREFIX` from `@holdem/shared`), so production can serve the web app and the api from one origin behind a reverse proxy (`/api/*` and `/socket.io/*` → api). Requests outside it get a 404 problem too.
- `configureApp` (shared by `main.ts` and the e2e tests) sets the global prefix, the security headers (helmet), CORS for `WEB_ORIGIN` with credentials (used in development, where web and api are two origins), `trust proxy`, a 16 KiB limit on JSON bodies and the socket.io adapter.
- A request that changes state (anything but GET, HEAD and OPTIONS) from a browser page on another origin than `WEB_ORIGIN` is refused with 403 `request.cross-origin`, before any route sees it: cookies ride along regardless of CORS (login CSRF). Requests without `Origin` are not from a browser and pass. AppModule applies it, and the auth mount after it, because middleware of global modules runs first and the order must be: logger, origin check, auth.
- socket.io refuses a connection whose `Origin` is not `WEB_ORIGIN`: CORS alone would let a page on another origin open a socket with the visitor's cookies (cross-site WebSocket hijacking). Clients without an `Origin` are not browsers and are let through. A message larger than `MAX_MESSAGE_BYTES` (64 KiB) closes the connection.
- Each client address may hold 20 open connections per instance (`MAX_CONNECTIONS_PER_ADDRESS`, room for a household behind one router) and open 60 a minute across instances (`HANDSHAKE_RULE`), since every handshake looks its session up. The address follows `TRUST_PROXY`, like Express's.
- Sockets carry the session of their handshake cookie. `authenticateSockets` (`shared/presentation/realtime/socket-session.ts`) runs when a client joins a namespace; the composition root hands it to `SocketIoAdapter`, so the adapter knows no identity code. It resolves the viewer through `ViewerResolver` into `socket.data.viewer`. Without a session the viewer is null, and only `PUBLIC_NAMESPACES` (the root, for `ping`) let it in; elsewhere the client gets `connect_error` with a 401 problem. A failed lookup refuses with a 500 problem.
- A socket outlives its session unless something checks: `@RealtimeGateway` re-reads the session before every command (`SocketSessionGuard`), and every signed-in socket is re-checked each minute while idle (`SESSION_RECHECK_MS`), since it still receives what its viewer may see. When the session is gone (signed out, expired, revoked by a password reset), the socket gets `session-expired` and is disconnected. The re-read also refreshes the viewer, so `RequirePlayer` in a gateway sees the email as it is now. `@CurrentUser()` works in gateway handlers too.

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
