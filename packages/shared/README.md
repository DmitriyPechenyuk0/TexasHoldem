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
```

Import a context through its subpath, so bundles only carry what they use:

```ts
import { ServerTimeResponse } from "@holdem/shared/contracts/system";
import { TableId, Chips } from "@holdem/shared";
```

## Conventions

- **A schema and its type share one name**: `export const ServerTimeResponse = z.object(…)` and `export type ServerTimeResponse = z.infer<typeof ServerTimeResponse>`.
- **Names say the role**: `XxxRequest` for bodies, `XxxQuery` for query strings, `XxxResponse` for responses, `XxxEvent` for socket messages. Shared building blocks (`Chips`, `TableId`) need no suffix.
- **Document the endpoint** on the response schema: `/** GET /system/time: … */`.
- **The inferred type is what the receiver gets after parsing.** When a schema coerces or defaults (`PageQuery.limit` arrives as text), the sender builds `z.input<typeof Schema>`.
- **Ids are branded UUIDs** (`UserId`, `TableId`, `HandId`), so the compiler rejects one where another is expected. Every id the api generates is a UUID, including Better Auth user ids.
- **Error responses are `Problem`** (RFC 9457, `application/problem+json`). Clients switch on `code`, never on `title` or `detail`.
- **No domain logic.** Schemas describe the shape and the basic ranges of data. Rules such as "a raise must be at least the last raise" belong to `@holdem/engine` and the api.
- **No runtime dependency besides zod, and nothing Node-only**: the package runs in the browser. The build has no Node types, so `process`, `Buffer` or `node:*` imports fail it, and a test checks `dependencies`.
- **Every contract is tested**: coverage must stay at 95% or more, so a contract that no test imports fails `pnpm test:coverage`.
