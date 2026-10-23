# Texas Hold'em

## Documentation

- [API architecture](apps/api/ARCHITECTURE.md): layers, CQRS conventions, naming and error handling.

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
- Branches are named `feat/<short-name>`, `fix/<short-name>` or `chore/<short-name>`. Putting the Linear key in the name links the branch to its issue, for example `feat/pok-25-env-config`.

Pull requests into `dev` are squash-merged, so their title becomes the commit and must follow the conventions above. CI checks the title. Put `Closes POK-<n>` in the description.

Release pull requests (`dev` → `master`) use a merge commit, so both branches share history. Use a title like `chore(release): v0.2.0`.

### Git hooks

Husky installs the hooks on `pnpm install`:

- `pre-commit` runs lint-staged: Prettier on every staged file, plus ESLint for `apps/web` and oxlint for `apps/api`. Each package owns its `lint-staged.config.*`, which extends the root one.
- `commit-msg` runs commitlint.
- `pre-push` runs `pnpm typecheck`.
