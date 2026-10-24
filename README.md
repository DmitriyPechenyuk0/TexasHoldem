# Texas Hold'em

No-Limit Texas Hold'em in the browser: sit down at a cash table with friends, share a private table by link, or just watch. Chips are virtual and free, so anyone can play at any time.

The project is in early development. The foundation (monorepo, API and web skeletons, quality gates) is done; the poker engine comes next.

**Planned for the first release:** cash tables with a 20-second turn timer and a time bank, private tables by link or code with an optional password, spectators, provably fair shuffles, sign-in with email or Google, GitHub and Discord, player profiles, friends and table chat, in English and Russian.

## Stack

| Area | Technology |
| --- | --- |
| Web | [Next.js](https://nextjs.org) 16 (App Router, Cache Components), React 19, Tailwind CSS 4, [Radix](https://www.radix-ui.com/primitives) primitives, TanStack Query, Zustand, next-intl |
| API | [NestJS](https://nestjs.com) 12 (DDD layers, CQRS), socket.io, Drizzle ORM, pino |
| Engine | A pure, deterministic TypeScript package shared by the server and the client |
| Contracts | zod schemas for every REST endpoint and socket event, shared by both apps |
| Data | PostgreSQL 18, Redis 8, S3-compatible storage (RustFS locally), SMTP (Mailpit locally) |
| Tooling | pnpm workspaces, TypeScript 6, Vitest, ESLint and Steiger (web), oxlint and dependency-cruiser (api), Prettier, Husky, commitlint, GitHub Actions |

## Repository layout

```
apps/
  api/          NestJS server: REST + socket.io on http://localhost:4000
  web/          Next.js app on http://localhost:3000
packages/
  engine/       @holdem/engine: the rules of the game, no I/O
  shared/       @holdem/shared: contracts between web and api
infra/          init scripts for the local Docker services
docker-compose.yml
RULES.md        the rules of No-Limit Hold'em this game follows (Russian: RULES.ru.md)
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) 24 or newer.
- [pnpm](https://pnpm.io) 11 or newer, e.g. `npm install --global pnpm`. Inside the repository it switches to the exact version pinned in `package.json` by itself.
- [Docker](https://docs.docker.com/get-docker/) with Compose v2, for PostgreSQL, Redis, Mailpit and S3 storage.

### Run it locally

```bash
git clone https://github.com/DmitriyPechenyuk0/TexasHoldem.git
cd TexasHoldem
pnpm install

# Configuration: the examples work as they are for local development.
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

pnpm infra:up     # starts the services and waits until they are healthy
pnpm db:migrate   # applies the database migrations
pnpm dev          # builds the packages, then runs everything in watch mode
```

Then open http://localhost:3000. The home page shows the server time when the web app reaches the API.

| Service | Address |
| --- | --- |
| Web app | http://localhost:3000 (UI component preview: http://localhost:3000/en/ui) |
| API | http://localhost:4000 (health: `/health`, readiness: `/health/ready`) |
| Mailpit inbox | http://localhost:8025 |
| S3 console | http://localhost:9001 (user `holdem`, password `holdem-dev-secret`) |
| PostgreSQL | `127.0.0.1:5433`, user, password and database `holdem` |
| Redis | `127.0.0.1:6379` |

Every service port binds to `127.0.0.1` only. If one is taken, override it in a root `.env` file (e.g. `POSTGRES_PORT=5434`, see `docker-compose.yml`) and update the matching URL in `apps/api/.env`.

`pnpm infra:down` stops the services and keeps their data; `pnpm infra:reset` wipes the data and starts them again.

## Scripts

Run from the repository root:

| Script | What it does |
| --- | --- |
| `pnpm dev` | Builds `packages/*`, then runs every workspace in watch mode |
| `pnpm build` | Production build of every workspace |
| `pnpm lint` | ESLint, Steiger and the message catalog check for web; oxlint and the dependency rules for the api |
| `pnpm typecheck` | TypeScript in every workspace |
| `pnpm test` | Unit tests of every workspace |
| `pnpm test:coverage` | All tests with coverage gates, including the api end-to-end suite (needs `pnpm infra:up`) |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm infra:up` / `infra:down` / `infra:reset` | Local Docker services |
| `pnpm db:generate` | Generates a migration from the Drizzle schema |
| `pnpm db:migrate` | Applies the pending migrations |
| `pnpm db:check` | Checks the migration history for conflicts |
| `pnpm db:studio` | Opens Drizzle Studio |

A single workspace runs with `pnpm --filter <name> <script>`, for example `pnpm --filter @holdem/api test:e2e`.

## Architecture

A full overview with diagrams arrives with the first release. Until then:

- [API architecture](apps/api/ARCHITECTURE.md): layers, CQRS conventions, naming and error handling.
- [Web architecture](apps/web/ARCHITECTURE.md): Feature-Sliced Design, i18n, data fetching and the UI layer.
- [Shared contracts](packages/shared/README.md): REST and socket contracts used by both apps.

## Game rules

The game follows the No-Limit Hold'em rules in [RULES.md](RULES.md) ([Русский](RULES.ru.md)), based on the Poker TDA Rules, 2024 edition.

## Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). A `commit-msg` hook runs commitlint on every commit; it is installed by `pnpm install`.

```
<type>(<scope>): <subject>

[optional body]

[optional footer, e.g. Closes POK-24]
```

- **type**: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `ci`, `chore`, plus `build`, `style` and `revert` from the conventional preset.
- **scope** (optional): a workspace area (`engine`, `api`, `web`, `shared`, `infra`, `deps`) or a bounded context (`gameplay`, `table`, `lobby`, `identity`, `profile`, `social`, `chat`, `history`, `moderation`, `tournament`, `bots`). The full list lives in `commitlint.config.ts`.
- **subject**: imperative mood, lower case, no trailing period, header up to 100 characters.

Examples:

```
feat(engine): add hand evaluator
fix(table): keep time bank after reconnect
chore(deps): update nestjs to 12.2
```

### Branches

- `dev` is the trunk: every change reaches it through a pull request from a short-lived branch.
- `master` holds stable versions only. It moves forward through a release pull request from `dev`.
- Branches are named `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>` or `chore/<short-name>`. Putting the Linear key in the name links the branch to its issue, for example `feat/pok-25-env-config`.

Pull requests into `dev` are squash-merged, so their title becomes the commit and must follow the conventions above. CI checks the title. Put `Closes POK-<n>` in the description.

Release pull requests (`dev` → `master`) use a merge commit, so both branches share history. Use a title like `chore(release): v0.2.0`.

### Git hooks

Husky installs the hooks on `pnpm install`:

- `pre-commit` runs lint-staged: Prettier on every staged file, plus ESLint for `apps/web` and oxlint for `apps/api`. Each package owns its `lint-staged.config.*`, which extends the root one.
- `commit-msg` runs commitlint.
- `pre-push` runs `pnpm typecheck`.

## License

[MIT](LICENSE)
