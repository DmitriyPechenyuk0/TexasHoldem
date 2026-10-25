# @holdem/api

The NestJS server: REST under `/api` and socket.io on http://localhost:4000. Layers, CQRS conventions and error handling: [ARCHITECTURE.md](ARCHITECTURE.md).

```bash
cp .env.example .env     # once; every variable is documented there
pnpm dev                 # watch mode; needs `pnpm infra:up` from the repository root
pnpm build && pnpm start:prod
pnpm lint                # oxlint + dependency rules
pnpm typecheck
pnpm test                # unit tests
pnpm test:e2e            # end-to-end tests against the local Postgres and Redis
pnpm test:coverage       # both, with the coverage gate
```

Database migrations live in `migrations/`: `pnpm db:generate` creates one from the Drizzle schemas, `pnpm db:migrate` applies them.
