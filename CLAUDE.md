# Coffee Roasters CRM

Backend CRM for a Sydney coffee roaster. NestJS 11 modular monolith, Prisma 7, PostgreSQL 18, pnpm, Node 22+.

## Domain rules

- Money is AUD, `Decimal(12,2)`. Never `Float` or JS `number` arithmetic for money.
- Amounts stored ex-GST with GST broken out (`subtotalExGst`, `gstAmount`, `totalIncGst`). GST is per line by `TaxCode`: `GST` = 10% rounded to cents, `GST_FREE` = 0 (most coffee beans; merch/equipment attract GST). Order lines snapshot price and tax code.
- Timestamps are `timestamptz` (UTC). Business dates (issue/due/delivery) are plain dates in `Australia/Sydney` (`APP_TIMEZONE`).
- Customers have an ABN; invoices must meet Australian tax-invoice requirements.

## Code layout

- `src/modules/<name>/` — one folder per module (customers, suppliers, supplier-invoices, inventory, orders, invoicing, reports).
- Each module's `index.ts` is its only public API. Never import another module's internals.
- `src/generated/prisma/` is generated — never edit; run `pnpm prisma:generate`.
- API is served under `api/v1` (see `src/app.setup.ts`); global `ValidationPipe` uses `whitelist` + `forbidNonWhitelisted`.

## Commands

- `pnpm db:up` — start Postgres (docker compose)
- `pnpm prisma:migrate` — create/apply migrations
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`

## Agent teams

Full reference: `docs/agent-teams.md`.

- Roles live in `.claude/agents/`: `product-owner`, `architect`, `backend-developer`, `qa-engineer`, `code-reviewer`. Always spawn teammates with these exact names and agent types — each role messages the others by name.
- Flow: `product-owner` (what/why, in `docs/domain/` + brief) → `architect` (how) → `backend-developer` + `qa-engineer` in parallel → `code-reviewer`.
- Business knowledge lives in `docs/domain/`. Anything marked "Assumption — confirm with roaster" is not settled; ask the user before building on it.
- Before spawning a team for a feature, the lead writes a brief at `docs/briefs/<feature>.md` (goal, scope, decisions so far, open questions). Spawn prompts only point to the brief; teammates read it first.
- Teammates update the brief's "Decisions" section when they settle something others depend on, instead of repeating it in messages.
- Each teammate edits only the files its role owns; ask the owner for anything else.
- The lead coordinates and waits for teammates; it does not implement tasks itself.
