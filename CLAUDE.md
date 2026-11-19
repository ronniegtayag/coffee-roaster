# Coffee Roasters CRM

CRM for a Sydney coffee roaster. pnpm monorepo, Node 22+:

- `apps/api` (`@coffee/api`): NestJS 11 modular monolith, Prisma 7, PostgreSQL 18.
- `apps/web` (`@coffee/web`): Vite, React, TypeScript, Tailwind + shadcn/ui, Zustand, TanStack Query + Router, Axios. Desktop and tablet.

Web and API are hosted separately (the API needs CORS). Design: `docs/design/frontend-backend-split.md`.

## Domain rules

- Money is AUD, `Decimal(12,2)`. Never `Float` or JS `number` arithmetic for money.
- Amounts stored ex-GST with GST broken out (`subtotalExGst`, `gstAmount`, `totalIncGst`). GST is per line by `TaxCode`: `GST` = 10% rounded to cents, `GST_FREE` = 0 (most coffee beans; merch/equipment attract GST). Order lines snapshot price and tax code.
- Timestamps are `timestamptz` (UTC). Business dates (issue/due/delivery) are plain dates in `Australia/Sydney` (`APP_TIMEZONE`).
- Customers have an ABN; invoices must meet Australian tax-invoice requirements.

## Code layout

- `apps/api/src/modules/<name>/` — one folder per module (customers, suppliers, supplier-invoices, inventory, orders, invoicing, reports).
- Each module's `index.ts` is its only public API. Never import another module's internals.
- `apps/api/src/generated/prisma/` is generated — never edit; run `pnpm api prisma:generate`.
- API is served under `api/v1` (see `apps/api/src/app.setup.ts`); global `ValidationPipe` uses `whitelist` + `forbidNonWhitelisted`.

## Commands

Run from the repo root:

- `pnpm db:up` / `pnpm db:down` — start/stop Postgres (docker compose, reads `apps/api/.env`)
- `pnpm dev` — run all apps; `pnpm api <script>` / `pnpm web <script>` — run a script in one app (e.g. `pnpm api prisma:migrate`)
- `pnpm check` — format, lint, typecheck, test and build for all apps. There is no CI: run it before every commit you push.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — all apps; `pnpm format` / `pnpm format:check` — Prettier at the root

Local gotcha: a Homebrew Postgres on `localhost:5432` will shadow the Docker one. Stop it (`brew services stop postgresql@18`) or set `POSTGRES_PORT` and `DATABASE_URL` in `apps/api/.env` to another port.

## Agent teams

Full reference: `docs/agent-teams.md`.

- Roles live in `.claude/agents/`: `product-owner`, `architect`, `backend-developer`, `qa-engineer`, `code-reviewer`. Always spawn teammates with these exact names and agent types — each role messages the others by name.
- Flow: `product-owner` (what/why, in `docs/domain/` + brief) → `architect` (how) → `backend-developer` + `qa-engineer` in parallel → `code-reviewer`.
- Business knowledge lives in `docs/domain/`. Anything marked "Assumption — confirm with roaster" is not settled; ask the user before building on it.
- Before spawning a team for a feature, the lead writes a brief at `docs/briefs/<feature>.md` (goal, scope, decisions so far, open questions). Spawn prompts only point to the brief; teammates read it first.
- Teammates update the brief's "Decisions" section when they settle something others depend on, instead of repeating it in messages.
- Each teammate edits only the files its role owns; ask the owner for anything else.
- The lead coordinates and waits for teammates; it does not implement tasks itself.
