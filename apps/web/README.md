# @holdem/web

The Next.js front end. Structure and import rules: [ARCHITECTURE.md](ARCHITECTURE.md).

```bash
cp .env.example .env     # once; every variable is documented there
pnpm dev                 # http://localhost:3000
pnpm build && pnpm start
pnpm lint
pnpm typecheck
```

Pages live in `src/_pages/<page>`; the route files in `app/` only re-export them.
