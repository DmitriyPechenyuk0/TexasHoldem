# Web architecture

The web app follows [Feature-Sliced Design 2.1](https://feature-sliced.design) with the layout of its official [Next.js guide](https://feature-sliced.design/docs/guides/tech/with-nextjs) (ADR-006), pages first.

## Layout

```
app/                  Next.js routing only: route files that re-export from src, plus favicon.ico
  layout.tsx          export { metadata, RootLayout as default } from "@/_app";
  page.tsx            export { HomePage as default } from "@/_pages/home";
instrumentation.ts    runs at server start; validates the environment
src/
  _app/               FSD app layer: root layout, providers, global styles
  _pages/             FSD pages layer: one slice per page, e.g. _pages/home
  widgets/            large self-contained blocks used by several pages
  features/           user interactions used by several pages
  entities/           business entities used by several pages
  shared/             no business meaning: ui, api, lib, config, i18n
public/               static files
```

- The FSD `app` and `pages` layers are named `_app` and `_pages`, as the guide recommends, so Next.js never mistakes them for its own `app` and `pages` folders.
- Next.js finds `instrumentation.ts` next to the `app` folder it routes from, so both live at the project root.
- A layer or segment folder exists only once it has content. `widgets`, `features`, `entities` and the `ui`, `lib` and `i18n` segments appear with their first code.

## Rules

- **Route files hold no code.** Everything under `app/` re-exports from `src`, so routes stay a thin, replaceable layer.
- **Imports only go down**: `_app` → `_pages` → `widgets` → `features` → `entities` → `shared`. A slice never imports another slice of the same layer.
- **Every slice has a public API**, its `index.ts`, and nothing outside the slice imports past it. Server-only code (Server Components that read secrets, data access marked `server-only`) goes in `index.server.ts`, so a Client Component importing the slice cannot pull it into the browser bundle. `@/shared/config/index.server` is the first example.
- **Pages first.** Code starts inside the page that needs it (`_pages/<page>/ui`, `model`, `api`). It moves down to `widgets`, `features` or `entities` only when a second page needs it, and to `shared` only if it has no business meaning.
- **One alias**: `@/` is `src/`, e.g. `@/_pages/home` and `@/shared/api`.

## Checks

`pnpm --filter @holdem/web lint:fsd` runs [Steiger](https://github.com/feature-sliced/steiger) with the recommended FSD rules on `src`: imports only go down, no cross-imports between slices, no sidestepping a public API, consistent naming. It is part of `pnpm lint`, the pre-commit hook and CI. The only exception, in `steiger.config.mjs`, is the layer-name check for `_app` and `_pages`: every other rule already treats them as the app and pages layers.

## Configuration and contracts

- Environment variables are read only in `src/shared/config`: `publicEnv` from `@/shared/config`, `serverEnv` from `@/shared/config/index.server` (enforced by lint).
- Requests and socket messages are typed and parsed with the contracts of `@holdem/shared` (`src/shared/api`).
