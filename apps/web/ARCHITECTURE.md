# Web architecture

The web app follows [Feature-Sliced Design 2.1](https://feature-sliced.design) with the layout of its official [Next.js guide](https://feature-sliced.design/docs/guides/tech/with-nextjs) (ADR-006), pages first.

## Layout

```
app/                  Next.js routing only: route files that re-export from src, plus favicon.ico
  [locale]/           every page lives under its locale; layout.tsx here is the root layout
    layout.tsx        export { generateMetadata, generateStaticParams, LocaleLayout as default } from "@/_app";
    page.tsx          export { HomePage as default } from "@/_pages/home";
    not-found.tsx     localized 404 for notFound() under a locale
    [...rest]/        any unmatched path under a locale, so its 404 is localized too
    ui/page.dev.tsx   the /ui preview of shared/ui, routed only under `next dev`
instrumentation.ts    runs at server start; validates the environment
proxy.ts              sends unprefixed URLs to a locale (next-intl middleware)
scripts/              repository checks, e.g. check-messages.mjs
src/
  _app/               FSD app layer: root layout (layouts), the query provider (api), global styles
  _pages/             FSD pages layer: one slice per page, e.g. _pages/home
  widgets/            large self-contained blocks used by several pages
  features/           user interactions used by several pages
  entities/           business entities used by several pages
  shared/             no business meaning: ui, api, lib, config, i18n
public/               static files
```

- The FSD `app` and `pages` layers are named `_app` and `_pages`, as the guide recommends, so Next.js never mistakes them for its own `app` and `pages` folders.
- Next.js finds `instrumentation.ts` next to the `app` folder it routes from, so both live at the project root.
- A layer or segment folder exists only once it has content. `widgets`, `features`, `entities` and the `lib` segment appear with their first code.
- Segments are named by purpose (`api`, `model`, `ui`), never by kind (`providers`, `hooks`, `components`); Steiger enforces it.

## Rules

- **Route files hold no code.** Everything under `app/` re-exports from `src`, so routes stay a thin, replaceable layer.
- **Imports only go down**: `_app` → `_pages` → `widgets` → `features` → `entities` → `shared`. A slice never imports another slice of the same layer.
- **Every slice has a public API**, its `index.ts`, and nothing outside the slice imports past it. Server-only code (Server Components that read secrets, data access marked `server-only`) goes in `index.server.ts`, so a Client Component importing the slice cannot pull it into the browser bundle. `@/shared/config/index.server` is the first example.
- **Pages first.** Code starts inside the page that needs it (`_pages/<page>/ui`, `model`, `api`). It moves down to `widgets`, `features` or `entities` only when a second page needs it, and to `shared` only if it has no business meaning.
- **One alias**: `@/` is `src/`, e.g. `@/_pages/home` and `@/shared/api`.

## Checks

`pnpm --filter @holdem/web lint:fsd` runs [Steiger](https://github.com/feature-sliced/steiger) with the recommended FSD rules on `src`: imports only go down, no cross-imports between slices, no sidestepping a public API, consistent naming. It is part of `pnpm lint`, the pre-commit hook and CI. The only exception, in `steiger.config.mjs`, is the layer-name check for `_app` and `_pages`: every other rule already treats them as the app and pages layers.

## i18n

[next-intl](https://next-intl.dev) with locale routing; the locales are `en` (default) and `ru`.

- **Every URL carries its locale** (`/en/...`, `/ru/...`, `localePrefix: "always"`) rather than a cookie-only locale: pages render statically per locale, and a shared link opens in the language it was sent in. `proxy.ts` redirects `/` and unprefixed paths by the `NEXT_LOCALE` cookie, then by `Accept-Language`, then to English. An unknown path under a locale gets the localized 404 (`[...rest]`). Paths with a file extension skip the proxy, so `/foo.txt` lands in `[locale]` with an unknown locale and gets the built-in Next.js 404: the check runs in the root layout, which has no not-found boundary above it.
- **Messages** live in `src/shared/i18n/messages/<locale>/<namespace>.json`, one namespace per page or slice (`home`, `common`, ...). A new namespace is added to `messages/index.ts` for every locale.
- **Keys are type-checked**: English is the source catalog, `app-config.ts` augments next-intl with its shape, and the plugin generates `*.d.json.ts` declarations (git-ignored) so `t()` also checks ICU arguments. Another locale missing a key is a type error.
- **Navigation** goes through `@/shared/i18n` (`Link`, `useRouter`, `redirect`, ...), which keeps the current locale. `LocaleSwitcher` from `@/shared/ui` links to the current page in every locale.
- **Server error codes** (`Problem.code` from `@holdem/shared`) get translated on the client by their code, never shown as the server's text: `useErrorMessage()` reads them from the `errors` namespace.

`pnpm --filter @holdem/web lint:i18n` (`scripts/check-messages.mjs`, part of `pnpm lint`, the pre-commit hook and CI) fails when a locale has a missing or extra namespace or key, an empty or invalid ICU text, or ICU arguments that differ from English. ESLint (`i18next/no-literal-string`) rejects literal text in JSX and in readable attributes (`alt`, `aria-label`, `placeholder`, `title`, ...).

## UI

- **Design tokens** live in `src/_app/styles/globals.css` as CSS variables mapped into the Tailwind theme: semantic colors with light and dark values (`bg-surface`, `text-muted-foreground`, `border-input`, `bg-primary`, `text-danger-text`, ...), the spacing unit, radii, the type scale, motion (`duration-fast|normal|slow`, `ease-standard`, the `animate-*` keyframes) and the stacking order (`z-overlay`, `z-modal`, `z-dropdown`, `z-toast`, `z-tooltip`). Components use only these, never raw palette colors such as `zinc-500`.
- **Dark mode** is the `dark` class on `<html>` (the `dark:` variant follows it). With no stored choice it follows the system; `ThemeSwitcher` stores light or dark in `localStorage`. The inline `themeScript` (`@/shared/lib`) applies it in `<head>` before the first paint, because the static HTML cannot know the choice; `<html>` has `suppressHydrationWarning` for that class only.
- **Primitives** in `src/shared/ui` are built on [Radix](https://www.radix-ui.com/primitives) (the `radix-ui` package) with Tailwind; no component kit is installed. Icons come from `lucide-react`, classes are joined with `cn` (`clsx` + `tailwind-merge`). They are `Button`, `Card`, `IconButton`, `Input`, `PasswordInput`, `Label`, `FormField`, `Dialog`, `DropdownMenu`, `Tooltip`, `Toast` (`toast()` + `Toaster`), `Tabs`, `Avatar`, `Slider`, `Switch`, `Spinner`, plus `LocaleSwitcher` and `ThemeSwitcher`.
- **Accessibility rules**: every interactive element shows the `focus-ring` on keyboard focus; an `IconButton` needs a `label` (its accessible name and tooltip); a `Dialog` needs a `DialogTitle`; a control inside `FormField` gets its id, hint and error wired through `aria-describedby` and `aria-invalid`. Text inside primitives (close, loading, show password) comes from `common.ui` in the catalogs. Under `prefers-reduced-motion` animations stop, except elements marked `data-motion="essential"` (the spinner).
- **Root providers**: the locale layout mounts `TooltipProvider` and `Toaster` once, inside `QueryProvider`.
- **Preview**: `pnpm dev`, then `/en/ui` shows every primitive in each state. `next.config.ts` adds the `dev.tsx` page extension only in the development phase, so production builds have no such route. The preview text is English only; the i18n lint rule skips `_pages/ui-preview`.

## Configuration and contracts

- Environment variables are read only in `src/shared/config`: `publicEnv` from `@/shared/config`, `serverEnv` from `@/shared/config/index.server` (enforced by lint). The one other reader is `next.config.ts`, which runs before the app.
- Every page carries security headers (`src/shared/config/security-headers.ts`, applied by `next.config.ts`): a Content Security Policy by allowlist, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, a Permissions-Policy that turns off camera, microphone, geolocation and payment, and HSTS outside `next dev`. The policy lets pages load code only from their own origin and connect only to the api (HTTP and WebSocket) and the storage. `STORAGE_ORIGINS` names the storage: where avatars are read from (the api's `S3_PUBLIC_URL`) and uploaded to (its `S3_ENDPOINT`). It is read when the app is built, so changing it needs a rebuild. Scripts stay `'unsafe-inline'`, since Next.js inlines its own and a nonce would make every page dynamic, giving up Cache Components; `next dev` adds `'unsafe-eval'` for its tools.
- Requests and socket messages are typed and parsed with the contracts of `@holdem/shared` (`src/shared/api`).

## Data fetching and state

- **HTTP goes through `HttpClient`** (`@/shared/api`): `request(path, { schema, method, body, query, signal })` sends the session cookie, parses the answer with its zod contract and throws:
  - `ApiError` for any error answer, with the server's `Problem` and its `code` (`table.seat-taken`, `request.invalid`, ...). An answer that is not problem+json, e.g. a 502 from a proxy, still gets one, with code `http.<status>`. Socket acks that fail throw the same `ApiError`.
  - `NetworkError` (code `network.unreachable`) when the api cannot be reached.
  - A plain `Error` when a successful answer breaks its contract: a bug, not something to show.
- **Two clients**: `http` for Client Components (`NEXT_PUBLIC_API_URL`), and `getServerHttp()` from `@/shared/api/index.server` for Server Components, which calls `API_URL` and forwards the visitor's cookies. Reading cookies makes the caller dynamic, so it renders inside `<Suspense>`.
- **Endpoints** are functions next to their contracts in `shared/api` (or a slice's `api` segment once they have business meaning) that take the client, e.g. `fetchServerTime(client)`, plus a `queryOptions` factory that defaults to `http`: `serverTimeQuery()`.
- **Server state lives in TanStack Query.** `getQueryClient()` gives each server render its own client and the browser one for the session. Defaults: `staleTime` 60 s, so prefetched data is not fetched again on hydration; retries only for network failures and 5xx, never on the server.
- **Prefetching**: a Server Component fills a client with `queryClient.query(serverTimeQuery(await getServerHttp())).catch(noop)` and wraps the Client Components in `<HydrationBoundary state={dehydrate(queryClient)}>`. A failed prefetch is not dehydrated, so the client fetches again and shows the error. `_pages/home/ui/prefetched-server-clock.tsx` is the example.
- **Client state lives in Zustand**, one small store per concern in the `model` segment of the slice that owns it (`_pages/home/model/server-clock.ts`), never a global store. Stores are module-level hooks (`create`), so the server must not write to them: they hold only what the browser sets in effects and event handlers, and anything the server renders comes through props or the query cache. Data from the api is never copied into a store.

## Session and routes

- **Paths** of pages live in `ROUTES` (`@/shared/config`), without the locale: `Link` and `redirect` from `@/shared/i18n` add it. A `next` parameter is such a path too, and passes through `safeNextPath` (`@/shared/lib`) before any redirect: only `/`-rooted paths on this site, never `//host`, `/\host` or another origin (open redirect).
- **The viewer** is the `entities/viewer` slice. `getViewer()` from `@/entities/viewer/index.server` reads the session through `GET /api/me` once per render (React `cache`), null without one. The site header (`_app/layouts/site-header.tsx`) puts it into the query cache on the server, so `useViewer()` knows it on the first paint: a reload never flashes the signed-out state.
- **Protected pages** are listed in `PROTECTED_ROUTES`. `proxy.ts` sends a request without a session cookie to `/<locale>/sign-in?next=<path>` before anything renders; it only checks that the cookie is there (`SESSION_COOKIE_NAMES` from `@holdem/shared`). The page then calls `requireViewer(path)`, which redirects an expired or revoked session the same way. Pages for signed-out visitors call `redirectSignedIn(next)`; it checks the session too, so a stale cookie can never bounce between a protected page and sign-in.
- **Ending a session** (`useSignOut` from `features/sign-out`, or a password reset) clears the query cache, runs every reset registered with `onSessionEnd` (`@/shared/lib`; a store that holds anything about the viewer registers one), and sets the viewer to null.
- **Signing in** is `/sign-in` (email or username, by whether it has an `@`) and `/sign-up`, both with `?next=`. Their forms check every field with the contracts of `@holdem/shared` before sending, and show the api's answers by code: a taken username under its field, wrong credentials and the rest under the form.
- **Providers** (`features/oauth-sign-in`): the buttons show the providers `GET /api/oauth-providers` names, and a click sends the browser to the provider through the api. It comes back to `next`, to `/choose-username?next=` for a new account, or to the page it started from with `?error=<code>`, which `OAuthError` explains. Settings link and unlink them (`_pages/settings`).
- **The username step**: a provider's first sign-in may leave the account without a username (`viewer.username === null`). `chooseUsernameRedirect` (`entities/viewer`) sends such a viewer to `/choose-username?next=<path>` from every page: `requireViewer` on the server for protected ones, `UsernameGate` in the layout for the rest. The step moves on to `next` once the username exists.
- **Emailed links** land on `/verify-email` (with `?next=`) and `/reset-password`. The api has already checked the token and adds `?error=TOKEN_EXPIRED` or `?error=INVALID_TOKEN` when it failed. The reset page takes the token out of the address bar as soon as it has read it.

## Profile

- **Players** are the `entities/user` slice: `UserAvatar` (the picture, or an identicon drawn from the username when there is none, the same everywhere) and `UserName`, for the header, the table, friends and chat. `useMyProfile()` reads the viewer's profile, which the site header prefetches next to the viewer; every change writes the api's answer back into the query cache, so the header follows a new nickname or avatar at once.
- **Settings** (`/settings`) has three tabs, kept in `?tab=`: profile (avatar, nickname), account (email, ways to sign in, password) and language, which saves the language of the site and the emails, then reloads the page in it.
- **Avatar upload** goes straight from the browser to storage: the api presigns it, `uploadToStorage` posts the file with XMLHttpRequest for its progress (fetch cannot report upload progress), then the api confirms it. The type and size are checked before anything is sent, but only the api's check of the file itself counts. The picked picture shows at once in the circle while it uploads.
- **Public profiles** live at `/profile/<username>` (`profilePath`), readable signed out; an unknown player gets the localized 404.

## Tests

`pnpm --filter @holdem/web test` runs Vitest on `src/**/*.spec.ts`, with the same globals as the other packages and the `@/` alias; the config sets the public env so `@/shared/config` imports cleanly. Components are not unit-tested yet: the Playwright suite (POK-111) covers them end to end.
