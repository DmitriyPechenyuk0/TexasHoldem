# Texas Hold'em

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

Work is trunk-based on `master`. Short-lived branches are named `feat/<short-name>`, `fix/<short-name>` or `chore/<short-name>`. Putting the Linear key in the name links the branch to its issue: `feat/pok-25-env-config`.
