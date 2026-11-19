# Design: split into backend (`apps/api`) and frontend (`apps/web`)

Status: **Approved 2026-11-19** (see [Decisions](#decisions-2026-11-19-by-the-user)). Being applied in the commit order below.

## Summary and recommendation

- Use **one pnpm monorepo** with `apps/api` (the current NestJS backend, moved with `git mv`) and `apps/web` (new Vite + React + TS + Tailwind + Zustand + TanStack Query + Axios). Don't add `packages/` until there's real shared code.
- **API contract:** the backend writes its OpenAPI document to a committed file, `apps/api/openapi.json`. The frontend generates **types only** from it with `openapi-typescript`. Fetch functions are hand-written on a single Axios instance. Money and business dates stay as **strings** end to end.
- **Frontend:** folders are organised by feature and mirror the backend modules. TanStack Query holds all server state. Zustand holds only the auth session and UI preferences. Routing uses **TanStack Router**.
- **Local dev:** Vite runs on `:5173` and proxies `/api`, `/health` and `/docs` to Nest on `:3000`. Because both are the same origin, dev needs no CORS. CORS is needed only if production serves the two apps from different origins.
- **Milestone 1** is a shell that doesn't depend on any business answers: layout, routing, API client, health page, and formatting utilities with tests. The read-only customers list comes once auth and a list endpoint exist.

---

## 1. Repo layout

| Option                                       | Pros                                                                                                                                                                                                                                                  | Cons                                                                                                                                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **(a) pnpm monorepo** `apps/api`, `apps/web` | One `.claude/` and `CLAUDE.md`, so agent teams see both sides. A cross-layer feature (DTO + screen) lands in one branch and one PR. One CI workflow. One lockfile and one Node version. The OpenAPI file can be checked for drift in the same CI run. | The backend has to move once (path churn). Scripts need `--filter`.                                                                                                                                                      |
| (b) Two repos                                | Independent deploys and history.                                                                                                                                                                                                                      | Duplicated `.claude/`, `CLAUDE.md` and domain docs that drift apart. Agent teams can't work across repos. The contract has to be published or copied between repos. Two CIs. That's a lot of overhead for one developer. |

**Choice: (a).** You work alone, and the agent-team flow (product-owner → architect → developers → qa → reviewer) depends on shared docs and shared roles. Separate deploys still work from a monorepo: each app builds on its own.

`packages/` is left out for now. Candidates for later: `packages/api-types` (if a second consumer appears) and `packages/eslint-config`.

## 2. Target folder tree

```
coffee-roaster/
├── .claude/                  # shared agent roles + settings (unchanged location)
├── .github/workflows/ci.yml  # new (directory is empty today)
├── docs/                     # shared: domain/, briefs/, design/
├── apps/
│   ├── api/                  # ← everything backend, moved with git mv
│   │   ├── src/ (modules/, config/, health/, prisma/, generated/ [ignored])
│   │   ├── prisma/ (schema.prisma, migrations/)
│   │   ├── test/             # e2e (jest-e2e.config.ts referenced but not created yet)
│   │   ├── openapi.json      # generated, committed API contract
│   │   ├── package.json      # name: @coffee/api
│   │   ├── prisma.config.ts  nest-cli.json  jest.config.ts  eslint.config.mjs
│   │   ├── tsconfig.json  tsconfig.build.json
│   │   └── .env.example      (.env untracked, lives here)
│   └── web/
│       ├── src/ (see §5)
│       ├── index.html  vite.config.ts  vitest.config.ts (or inline)  eslint.config.mjs
│       ├── tsconfig.json  tsconfig.app.json  tsconfig.node.json
│       ├── package.json      # name: @coffee/web
│       └── .env.example
├── docker-compose.yml        # stays at root (shared infra)
├── package.json              # root: private, workspace scripts, prettier only
├── pnpm-workspace.yaml       # packages: apps/*, packages/* + existing allowBuilds
├── pnpm-lock.yaml
├── .prettierrc  .prettierignore  .editorconfig  .nvmrc  .gitignore
└── CLAUDE.md
```

## 3. Migration plan for the backend

### What moves to `apps/api/` (with `git mv`)

`src/`, `prisma/`, `prisma.config.ts`, `nest-cli.json`, `jest.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `tsconfig.build.json`, `.env.example`, `package.json`.

`test/` is empty and untracked, so git can't move it. Create `apps/api/test/` when the first e2e test is written.

### What stays at the root

`.claude/`, `CLAUDE.md`, `docs/`, `docker-compose.yml`, `.prettierrc`, `.prettierignore`, `.editorconfig`, `.nvmrc`, `.gitignore`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.github/`.

### What changes in each file

| File                                                                                                                                                                                                             | Change                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm-workspace.yaml`                                                                                                                                                                                            | Add `packages: ['apps/*', 'packages/*']` and keep `allowBuilds` at the root. If pnpm asks during the web scaffold, add `esbuild: true`.                                                                                                                                                                                                                                                                      |
| Root `package.json` (new)                                                                                                                                                                                        | `private: true`, `packageManager`, `engines`. devDeps: `prettier` only. Scripts: `dev` (`pnpm -r --parallel --filter "./apps/*" dev`), `build`, `lint`, `typecheck`, `test` (all `pnpm -r run <x>`), `format`/`format:check` (root prettier), `db:up`/`db:down` (docker compose, see below), `api` (`pnpm --filter @coffee/api`) and `web` (`pnpm --filter @coffee/web`) so `pnpm api prisma:migrate` works. |
| `apps/api/package.json`                                                                                                                                                                                          | Rename to `@coffee/api`. Drop `packageManager`, `db:*` and `format*` (they move to the root). Add `dev` as an alias of `start:dev` and `openapi:emit` (§4). `postinstall: prisma generate` stays here and runs inside `apps/api`. Move `prettier` to the root and keep `eslint-plugin-prettier`/`eslint-config-prettier` here.                                                                               |
| `prisma.config.ts`, `schema.prisma` (`output = "../src/generated/prisma"`), `jest.config.ts` (`rootDir: 'src'`), `nest-cli.json`, `tsconfig*.json`, `eslint.config.mjs` (`tsconfigRootDir: import.meta.dirname`) | **No change.** All their paths are relative to the file itself or to the package directory. `dotenv/config` reads `.env` from the cwd, and that is `apps/api` when run through `--filter`.                                                                                                                                                                                                                   |
| `.gitignore`                                                                                                                                                                                                     | Change `src/generated/` to `apps/api/src/generated/`. `node_modules/`, `dist/` and `coverage/` have no leading slash, so they already match at any depth. Add `*.tsbuildinfo` and `apps/web/src/**/routeTree.gen.ts` (only if not committed, see the open question).                                                                                                                                         |
| `.prettierignore`                                                                                                                                                                                                | Change `src/generated` to `apps/api/src/generated`, change `prisma/migrations` to `apps/api/prisma/migrations`, and add `apps/web/src/shared/api/schema.d.ts` and `apps/api/openapi.json`.                                                                                                                                                                                                                   |
| `docker-compose.yml`                                                                                                                                                                                             | Stays at the root. Root `db:up` becomes `docker compose --env-file apps/api/.env up -d postgres`, so `POSTGRES_*` has a single source. Compose's built-in defaults still match.                                                                                                                                                                                                                              |
| `.env` (untracked)                                                                                                                                                                                               | Move it by hand to `apps/api/.env`. Delete the stale root `dist/` and `node_modules/`, then run `pnpm install`.                                                                                                                                                                                                                                                                                              |
| `pnpm-lock.yaml`                                                                                                                                                                                                 | Regenerate it in place with `pnpm install`. Importers become `apps/api` (and later `apps/web`).                                                                                                                                                                                                                                                                                                              |

### Ordered commit plan

Each commit leaves the repo building and passing `pnpm typecheck && pnpm lint && pnpm test`.

1. `docs(design): add frontend/backend split design` (this note).
2. `refactor(repo): move backend into apps/api pnpm workspace`. This covers the `git mv` of the files above, the new root `package.json`, the workspace yaml, the `.gitignore`/`.prettierignore` paths and the regenerated lockfile. Keep the edits minimal so git's rename detection holds. Check: `pnpm install`, `pnpm api prisma:generate`, `pnpm db:up`, `pnpm api start:dev`, then `GET /health` and `/docs`. Afterwards, `git log --follow apps/api/src/main.ts` shows the full history.
3. `docs: update CLAUDE.md, agent-teams and agent roles for apps/ layout` (§8, path changes only).
4. `ci: add GitHub Actions workflow for lint, typecheck and test`. Uses Node from `.nvmrc`, `pnpm install --frozen-lockfile` and the root scripts.
5. `chore(web): scaffold apps/web with Vite, React and TypeScript` (`pnpm create vite apps/web --template react-ts`, renamed to `@coffee/web`).
6. `chore(web): add Tailwind CSS` (v4 via `@tailwindcss/vite`).
7. `chore(web): add ESLint, Vitest and Testing Library`.
8. `feat(web): add API client and query provider` (Axios instance, error normalisation, QueryClient, Vite proxy, `.env.example`).
9. `feat(web): add router and app shell layout` (TanStack Router, sidebar, 404, error boundary).
10. `feat(web): add AUD, GST and Sydney date formatting utils` (with tests).
11. `feat(web): add system status page using /health`.
12. `feat(api): emit openapi.json and generate web API types` (`openapi:emit` in api, `api:types` in web, plus a CI drift check).
13. `chore(claude): add frontend-developer role` (§8).

14. `feat(api): enable CORS for configured origins` (required: web and API are hosted separately).

Later, outside this plan: the auth module and the customers list.

Push after commit 2 has been verified locally. No other branches exist, so the move won't conflict with anything.

## 4. Shared API contract

| Option                                          | Verdict                                                                                                                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared `packages/types` imported by both        | Rejected. Backend DTOs are decorated classes (class-validator, swagger) and would pull Nest dependencies into the browser bundle. Prisma types describe the database shape (a `Decimal` object, a `Date`), not the JSON wire shape (strings). |
| Hand-written frontend types                     | Rejected. They drift without anyone noticing, and nothing checks them.                                                                                                                                                                        |
| Generated client with hooks (orval, hey-api)    | Not now. The generated hooks would compete with our query-key and feature conventions, and the output is only as good as the Swagger decorators, which are thin today.                                                                        |
| **OpenAPI → types only (`openapi-typescript`)** | **Chosen.** It's small and it's generated. Fetch functions stay hand-written on our Axios instance, and that's where the money and date handling lives.                                                                                       |

How it works:

- `apps/api`: `pnpm api openapi:emit` runs a script that builds the Nest app in preview mode (`NestFactory.create(AppModule, { preview: true })`, no DB connection) using the same `DocumentBuilder` as `app.setup.ts`, then writes `apps/api/openapi.json`. Env validation needs dummy `DATABASE_URL` and `JWT_SECRET` values in that script. Check that preview mode works with the Prisma provider.
- `apps/web`: `pnpm web api:types` generates `src/shared/api/schema.d.ts` from `../api/openapi.json`. Both files are committed, so contract changes appear in PR diffs. CI re-runs both scripts and fails on `git diff --exit-code`.
- Backend convention (for backend-developer): every response DTO needs accurate `@ApiProperty` decorators. Money fields are `type: String, example: '1234.50'`. Business dates are `type: String, format: 'date'`. Otherwise the generated types come out as `unknown`. You can enable the Nest CLI swagger plugin to cut down the boilerplate.

### Money (AUD, `Decimal(12,2)`)

- On the wire, money is always a **string** like `"1234.50"`. Prisma `Decimal` already serialises to JSON this way. Requests send strings that match `^\d{1,10}(\.\d{1,2})?$`.
- The frontend **never** uses `parseFloat`/`Number` for arithmetic. It displays money with `Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(str)`. Modern `Intl` accepts a string without losing precision.
- GST and totals are **calculated on the server**. If a form needs a live preview (for example order lines), use a decimal library (`big.js`) with the same rule (10% of ex-GST, rounded half-up to cents, per line), show it as an estimate, and treat the server response as authoritative.

### Business dates (Sydney-local) and timestamps

- Business dates (issue, due, delivery) are `"YYYY-MM-DD"` strings on the wire. **Backend gap:** Prisma returns `@db.Date` as a JS `Date`, which serialises as `"2026-11-19T00:00:00.000Z"`. Response DTOs must map it to `YYYY-MM-DD`, and request DTOs should accept `IsISO8601({ strict: true })` date-only strings.
- The frontend never calls `new Date('YYYY-MM-DD')`, because that parses as UTC midnight and shows the wrong day in some time zones. Utilities instead:
  - `formatBusinessDate('2026-11-19')`: split the string, build the date with `Date.UTC`, and format with `timeZone: 'UTC'` and `en-AU`.
  - `todayInSydney()`: `Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' })`, which returns `YYYY-MM-DD`.
  - `formatTimestamp(iso)`: format with `timeZone: 'Australia/Sydney'` explicitly, not the browser's time zone.
- The `APP_TIMEZONE` constant lives in `shared/config` with the value `'Australia/Sydney'`, matching the backend.

## 5. Frontend architecture

```
apps/web/src/
├── main.tsx
├── app/
│   ├── providers.tsx         # QueryClientProvider, RouterProvider, devtools (dev only)
│   ├── router.tsx            # createRouter, context { queryClient }
│   ├── routes/               # TanStack Router file routes: __root.tsx, index.tsx, system/status.tsx, customers/...
│   └── layout/               # AppShell, Sidebar, Header, ErrorBoundary, NotFound
├── shared/
│   ├── api/                  # http.ts (axios), errors.ts (ApiError), query-client.ts, schema.d.ts (generated)
│   ├── config/env.ts         # typed import.meta.env access + APP_TIMEZONE
│   ├── lib/                  # money.ts, dates.ts, abn.ts (+ *.test.ts)
│   └── ui/                   # Button, Table, Badge, Spinner, EmptyState ... (Tailwind)
├── stores/                   # auth.store.ts, ui.store.ts (Zustand)
└── features/                 # mirrors apps/api/src/modules
    ├── health/               # api.ts, queries.ts, components/, index.ts
    └── customers/            # api.ts, queries.ts, components/, index.ts
```

- **Feature boundaries:** each feature's `index.ts` is its public API, the same rule as the backend. Routes and other features import only from `features/<x>` (enforced with an ESLint `no-restricted-imports` rule on `features/*/!(index)`).
- **TanStack Query is the only home for server state.** Query keys use a factory per feature, and the first segment is the backend module name:
  ```ts
  export const customerKeys = {
    all: ['customers'] as const,
    lists: () => [...customerKeys.all, 'list'] as const,
    list: (f: CustomerListFilters) => [...customerKeys.lists(), f] as const,
    detail: (id: string) => [...customerKeys.all, 'detail', id] as const,
  };
  ```
  Mutations invalidate `customerKeys.all` or narrower keys. QueryClient defaults: `staleTime: 30_000`, no retry on 4xx, at most 2 retries on network/5xx errors.
- **Zustand is for client state only.** `auth.store` holds `{ accessToken, user, setSession, clear }`. `ui.store` holds `{ sidebarCollapsed, tableDensity }` and persists to localStorage. Server data never goes in Zustand. Components outside React (the Axios interceptor) read the store with `useAuthStore.getState()`.
- **Axios** (`shared/api/http.ts`):
  - One instance: `baseURL: import.meta.env.VITE_API_BASE_URL` (default `/api/v1`), `timeout: 15_000`. `/health` sits outside the prefix, so it's called with an absolute path (`http.get('/health', { baseURL: '/' })`).
  - Request interceptor: adds `Authorization: Bearer <token>` when a token exists.
  - Response interceptor: on 401, it calls `auth.clear()` and `queryClient.clear()` and sends the user to `/login?redirect=…`. A single-flight refresh-and-retry can be added once the auth design defines refresh tokens.
  - Error normalisation: Nest's `{ statusCode, message: string | string[], error }` becomes `ApiError { status, message, details: string[] }`. This covers the ValidationPipe's message arrays, and network and timeout errors map to `status: 0`.
- **Routing: TanStack Router (file-based, Vite plugin).** It has type-safe params and **typed, validated search params**, which suit CRM list filters (status, date range, page) kept in the URL. Its loaders integrate with TanStack Query (`queryClient.ensureQueryData`), and it comes from the same vendor as Query. Alternative: React Router v7 (data mode), which is more familiar but has weaker typing of search params.
- **Forms:** React Hook Form + Zod (Zod is already used in the backend), with money and date fields as strings. Add these with the first write screen, not in milestone 1.
- **Formatting** (`shared/lib`): `formatAud`, `formatGstBreakdown({ subtotalExGst, gstAmount, totalIncGst })`, `formatBusinessDate`, `formatTimestamp`, `todayInSydney`, `formatAbn` (`12 345 678 901`). All of them use `en-AU`.

## 6. Local dev

|      | API                                  | Web                                     |
| ---- | ------------------------------------ | --------------------------------------- |
| Port | 3000 (`PORT`)                        | 5173 (Vite default)                     |
| Run  | `pnpm api dev`                       | `pnpm web dev` (or `pnpm dev` for both) |
| Env  | `apps/api/.env` (existing variables) | `apps/web/.env` (see below)             |

- **Vite proxy, not CORS, in dev.** `vite.config.ts` proxies `/api`, `/health` and `/docs` to `VITE_DEV_API_TARGET` (default `http://localhost:3000`). Because the browser sees one origin, nothing needs to change in the backend for dev.
- **Production:** if the web app is served from the same origin as the API (a reverse proxy, or Nest serving static files), no CORS is needed. If they're on different origins, add `CORS_ORIGINS` (a comma-separated allowlist, validated in `env.ts`) and `app.enableCors({ origin: allowlist })` in `configureApp`. This depends on the deploy target (open question).
- `apps/web/.env.example`:
  ```
  VITE_API_BASE_URL=/api/v1
  # dev server only (read via loadEnv in vite.config.ts, not exposed to the browser)
  VITE_DEV_API_TARGET=http://localhost:3000
  ```
  Every `VITE_*` variable ends up in the public bundle, so none of them may hold a secret.

## 7. Testing and quality (web)

- **Unit and component tests:** Vitest + jsdom + `@testing-library/react` + `@testing-library/user-event`. Tests live next to the code as `*.test.ts(x)`. Mock the API with **MSW** handlers per feature, so tests exercise the real Axios instance, interceptors and query hooks.
- **Must-have tests:** the money and date utilities (Sydney/UTC boundary, `YYYY-MM-DD` parsing, string-precision currency), error normalisation, and the 401 interceptor.
- **E2E:** Playwright, deferred until the first real flow (login + customers list).
- **Lint and format:** Prettier lives at the root and is shared (the same `.prettierrc`). ESLint config is per app because the environments differ: the API is Node and decorators, the web app is browser, React, `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh`. Both use `typescript-eslint` `recommendedTypeChecked` + `eslint-config-prettier`. A shared `packages/eslint-config` isn't worth it yet.
- **CI** (one workflow): `pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm -r build`, and the OpenAPI drift check.

## 8. Agent roles impact (to be described only, not applied here)

### New role: `.claude/agents/frontend-developer.md` (model: sonnet)

- **Owns:** `apps/web/**`, except test files if `qa-engineer` owns them (open question). It regenerates `apps/web/src/shared/api/schema.d.ts` but never edits it by hand.
- **Conventions:** everything in §4 and §5. No number arithmetic on money. Dates only through `shared/lib/dates`. No server data in Zustand. Features import each other only through `index.ts`. Query keys come from the feature's key factory. Tailwind only, no inline styles. No secrets in `VITE_*`.
- **Messages:** gets the design note and DTO shapes from `architect`. Asks `architect` when the contract doesn't fit the UI (it doesn't ask `backend-developer` directly). Tells `qa-engineer` which UI states to cover (loading, empty, error, 401, validation errors). Hands off to `code-reviewer`.

### Changes to existing files

- **`CLAUDE.md`:** change the description from "Backend CRM" to a monorepo with `apps/api` and `apps/web`. Code layout paths become `apps/api/src/modules/...` and `apps/api/src/generated/prisma/`, and `apps/web/src/features/...` is added. Commands become `pnpm dev`, `pnpm api <script>` and `pnpm web <script>`. Add frontend domain rules (money as a string, Sydney date utilities). Add `frontend-developer` to the role list. The flow becomes architect → backend-developer + frontend-developer + qa-engineer → code-reviewer.
- **`docs/agent-teams.md`:** the "Project status" role list and paths, plus the example spawn prompt that mentions `src/`.
- **`architect.md`:** paths change to `apps/api/prisma/...` and `apps/api/src/modules/<name>/index.ts`. It also owns the API contract, meaning DTO shapes in design notes and the committed `apps/api/openapi.json`. Design notes gain a short "UI" section (screens, query keys, states). It messages `frontend-developer` too.
- **`backend-developer.md`:** paths change. Accurate `@ApiProperty` on every DTO (money as a string, dates in `format: 'date'`). Response DTOs map `@db.Date` to `YYYY-MM-DD`. It runs `pnpm api openapi:emit` when DTOs change.
- **`qa-engineer.md`:** paths change (`apps/api/src/**/*.spec.ts`, `apps/api/test/`). If it also owns web tests, add `apps/web/src/**/*.test.ts(x)` and the Vitest/MSW conventions.
- **`code-reviewer.md`:** add a frontend checklist (money/date handling, boundary imports, Zustand misuse, token handling, `VITE_*` secrets, a11y basics).
- **`product-owner.md`:** no path changes. Optionally, acceptance criteria could include UI behaviour.
- **`docs/briefs/_template.md`:** optionally add a "UI / screens" section.

## 9. First milestone (M1): shell with no dependency on business answers

Included:

- Vite app with Tailwind, the TanStack Router root layout (sidebar listing the backend modules; links to screens that don't exist yet are disabled or "coming soon"), 404 page and error boundary.
- Axios instance, error normalisation, QueryClient, the Vite proxy and env typing.
- A **System status** page that calls `GET /health` (Terminus `{ status, info, error, details }`) and shows API and DB status with loading and error states.
- `shared/lib` money, date and ABN formatters, with unit tests.
- An auth store skeleton (shape only, no login screen yet), CI, and the `frontend-developer` role.

**M2** (blocked by backend work): a login page once the auth module exists, then a **read-only customers list** (paginated, search by name/ABN, filters in URL search params) once `GET /api/v1/customers` exists. Customer basics (name, ABN, contact) don't depend on the open roaster questions.

Not in scope until `docs/domain/` answers are confirmed: orders, invoicing, inventory, supplier screens and anything that writes money values.

## Risks

- **Date serialisation:** if a response DTO doesn't map `@db.Date`, the API returns a UTC timestamp for a business date. Tests on both sides should catch this.
- **Thin Swagger decorators:** the generated types turn into `unknown`. Mitigations are the review checklist and the swagger CLI plugin.
- **`forbidNonWhitelisted`:** the frontend must send exactly the DTO shape, so extra form fields return a 400. Use the generated request types for every payload.
- **OpenAPI emit without a DB:** preview mode or env validation may need small adjustments. Fallback: fetch `/docs-json` from a running dev API.
- **History after the move:** use `git log --follow` for each file. GitHub blame follows renames. Keep commit 2 to moves plus minimal edits.
- **Local state left behind:** the untracked `.env`, stale root `dist/` and root `node_modules/` need manual cleanup. Agent memory and IDE settings may still point at the old paths.
- **Toolchain:** the backend lists `eslint ^9` with `@eslint/js ^10`. Line the majors up when adding the web ESLint config. pnpm may also ask to approve build scripts for `esbuild`.

## Decisions (2026-11-19, by the user)

- **Monorepo approved:** `apps/api` + `apps/web` in this repo.
- **Router:** TanStack Router.
- **UI components:** shadcn/ui on top of Tailwind (components copied into `apps/web`).
- **Devices:** desktop and tablet. Layouts must work at tablet width (~768px and up, touch-friendly targets); phone layouts are out of scope for now.
- **Hosting: web and API on separate hosts.** Consequences:
  - CORS is required: add `CORS_ORIGINS` (comma-separated allowlist, validated in `env.ts`) and `app.enableCors({ origin: allowlist, credentials: true })` in `configureApp`. This moves from "later, if needed" into the plan, before M2.
  - In production `VITE_API_BASE_URL` is an absolute URL (e.g. `https://api.<domain>/api/v1`); the Vite proxy is dev only.
  - Auth design: if a refresh token goes in an httpOnly cookie, prefer subdomains of one domain (e.g. `app.<domain>` + `api.<domain>`, same-site) so the cookie can use `SameSite=Lax`. Fully different domains need `SameSite=None; Secure` and are increasingly blocked by browsers as third-party cookies.
- **Frontend tests are owned by `qa-engineer`** (`apps/web/src/**/*.test.ts(x)`, Vitest + Testing Library + MSW). `frontend-developer` does not write tests; it tells `qa-engineer` which UI states to cover.
- **Defaults taken (no objection raised):** package names `@coffee/api` and `@coffee/web`; generated files (`openapi.json`, `schema.d.ts`, `routeTree.gen.ts`) are committed.

## Open questions for the user

1. **Hosting provider and domains:** where will each app be hosted, and will they share a parent domain (`app.` / `api.`)? Needed before the CORS allowlist and the auth design.
2. **Auth token storage** (needed for the auth design): access token in memory + refresh token in an httpOnly cookie (recommended; the backend needs a refresh endpoint and cookie handling), or a simpler localStorage token?

## Changes made during implementation (2026-11-19)

The code is the source of truth where it differs from the sections above.

- **API URL env var:** `VITE_API_URL` is the API _origin_ (empty in dev, e.g. `https://api.example.com` in production). The `/api/v1` prefix is a constant (`shared/config/env.ts`), and `/health` uses a second Axios instance (`rootHttp`) on the same origin. The dev proxy target is `DEV_API_TARGET` (not `VITE_`-prefixed, so it never reaches the browser).
- **Folder layout:** routes, router and layout live under `src/app/` (`src/app/routes`, generated `src/app/routeTree.gen.ts`). shadcn/ui components are generated into `src/shared/ui`, and its `cn` helper into `src/shared/lib/utils.ts` (aliases in `components.json`).
- **TypeScript 5.9** in both apps: the Vite template's TypeScript 7 isn't supported by typescript-eslint yet. Strict mode is on (the template left it off).
- **ESLint 10** in both apps (the API was upgraded from 9 to match `@eslint/js` 10).
- **Package age:** pnpm's minimum-release-age policy rejects packages published in the last day. Pick versions at least ~2 weeks old instead of adding exclusions to `pnpm-workspace.yaml` (e.g. Vitest 5.1.0, jest-dom 7.0.1).
- **Gateway errors:** a 502–504 without a Nest body (API down behind the dev proxy or a load balancer) becomes `ApiError(status, 'Cannot reach the server')`.
- **Not done yet:** MSW, the OpenAPI types (step 12), the `frontend-developer` role (step 13) and CORS (step 14). Formatter and component tests are for `qa-engineer`.
