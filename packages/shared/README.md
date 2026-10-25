# @holdem/shared

Contracts between the web app and the api (ADR-007): zod schemas for every REST request and response and every socket event, with the TypeScript types inferred from them. The api validates incoming data with them; the web app parses server responses with the same schemas, so the two sides cannot drift apart silently.

## Layout

```
src/
  index.ts                  re-exports contracts/common only
  contracts/
    common/                 primitives every context uses: ids, Chips, Locale, pagination, Problem
    <context>/              one folder per bounded context (system, lobby, table, …)
      <operation>.ts        the schemas of one endpoint or event
      index.ts              the context's public entry
  realtime/                 socket.io namespaces and their events: define.ts, then one file per namespace
```

Import a context through its subpath, so bundles only carry what they use:

```ts
import { ServerTimeResponse } from "@holdem/shared/contracts/system";
import { PingEvent } from "@holdem/shared/realtime";
import { TableId, Chips } from "@holdem/shared";
```

## Realtime

`src/realtime` describes socket.io traffic the same way: `@holdem/shared/realtime`.

```ts
export const PingEvent = defineEvent("ping", PingPayload, PingAck); // name, payload, ack data

export const systemNamespace = defineNamespace(NAMESPACES.system, {
	clientToServer: [PingEvent],
	serverToClient: [],
});

// web: Socket<SystemServerToClientEvents, SystemClientToServerEvents>
// api: Server<SystemClientToServerEvents, SystemServerToClientEvents>
export type SystemClientToServerEvents = ClientToServerEvents<typeof systemNamespace>;
```

- **Namespaces** are `/table`, `/lobby` and `/social`, plus the root `/` for connection-level events such as `ping` (`NAMESPACES`).
- **Commands** (client → server) take an ack schema and are answered with `Ack<Data>`. Emit them with `emitWithAck`; the compiler requires the ack. **Events** without an ack are fire-and-forget.
- **Event names are kebab-case and stable.** A name is part of the contract: a breaking change to its payload or ack gets a new name (`take-seat-v2`) while the old one is still served, and the old one is removed only when no client sends it.
- **Realtime schemas never coerce or transform.** JSON keeps types over a socket, so the sender's type and the parsed type are the same.
- The receiver always parses: the api validates every payload, and the web app parses acks with `ackOf(Event.ack)`.

## Conventions

- **A schema and its type share one name**: `export const ServerTimeResponse = z.object(…)` and `export type ServerTimeResponse = z.infer<typeof ServerTimeResponse>`.
- **Names say the role**: `XxxRequest` for bodies, `XxxQuery` for query strings, `XxxResponse` for responses, `XxxEvent` for socket messages. Shared building blocks (`Chips`, `TableId`) need no suffix.
- **Document the endpoint** on the response schema: `/** GET /api/system/time: … */`.
- **The inferred type is what the receiver gets after parsing.** When a schema coerces or defaults (`PageQuery.limit` arrives as text), the sender builds `z.input<typeof Schema>`.
- **Ids are branded UUIDs** (`UserId`, `TableId`, `HandId`), so the compiler rejects one where another is expected. Every id the api generates is a UUID, including Better Auth user ids.
- **Error responses are `Problem`** (RFC 9457, `application/problem+json`). Clients switch on `code` and translate it as the message key, filling in `params`; `title` and `detail` are English fallbacks. Invalid requests list their fields in `errors`.
- **Socket commands reply with an `Ack`**: `{ ok: true, data }` (`AckSuccess`) or `{ ok: false, error: Problem }` (`AckFailure`). Build its schema with `ackOf(DataSchema)`.
- **Every route lives under `API_PREFIX` (`/api`).** Schemas document paths with it: `GET /api/system/time`. The web client adds the prefix itself, so callers pass `/system/time`.
- **Better Auth's endpoints** (`/api/auth/*`, the `identity` context) answer with Better Auth's own bodies on success. The requests the api accepts there are contracts here (`SignUpRequest`, `SignInEmailRequest`, `SignInUsernameRequest`); their errors are `Problem`s like everywhere else.
- **No domain logic.** Schemas describe the shape and the basic ranges of data. Rules such as "a raise must be at least the last raise" belong to `@holdem/engine` and the api.
- **No runtime dependency besides zod, and nothing Node-only**: the package runs in the browser. The build has no Node types, so `process`, `Buffer` or `node:*` imports fail it, and a test checks `dependencies`.
- **Every contract is tested**: coverage must stay at 95% or more, so a contract that no test imports fails `pnpm test:coverage`.
