# Design: auth and customers/branches API

Status: **Draft 2026-11-19** (architect). Brief: [`docs/briefs/auth-and-customers.md`](../briefs/auth-and-customers.md). Settled points are copied to the brief's Decisions as D-AR-1 to D-AR-11.

The role matrix (D-PO-7) and payment-terms range are working defaults (OQ-PO-1, OQ-PO-3). This design keeps them in one place each, so changing them is a one-line edit.

## 1. Modules and boundaries

| Module                 | Owns                                                                                       | Public API (`index.ts`)                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `modules/auth` (new)   | `User` reads, `AuthSession`, login/refresh/logout/me, global guards, the permission matrix | `AuthModule`, `Public`, `RequirePermission`, `CurrentUser`, `Permission`, `hasPermission`, type `AuthUser` |
| `modules/customers`    | `Customer`, `Branch`, ABN validation                                                       | Unchanged: `CustomersModule`, `CustomersService`                                                           |
| `common/` (new, infra) | `apiError()` helper, ValidationPipe `exceptionFactory`                                     | Not a module. Imported like `config/` and `prisma/`.                                                       |

`apps/api/src/modules/auth/index.ts` must export exactly:

```ts
// Public API of the auth module. Other modules must import from here, not from internals.
export { AuthModule } from './auth.module';
export { Public } from './decorators/public.decorator';
export { RequirePermission } from './decorators/require-permission.decorator';
export { CurrentUser } from './decorators/current-user.decorator';
export { Permission, hasPermission } from './permissions';
export type { AuthUser } from './auth-user';
```

- `customers` imports only from `../auth`. `health.controller.ts` imports `Public` from `../modules/auth`.
- `AuthModule` registers two `APP_GUARD`s in this order: `JwtAuthGuard` (skips handlers marked `@Public()`), then `PermissionsGuard` (checks `@RequirePermission(...)`; a handler with no decorator only needs a valid login).
- Nothing outside `auth` touches `prisma.user` or `prisma.authSession`.

## 2. Auth

### 2.1 Token storage (recommendation, D-AR-1)

**Access token in memory + refresh token in an httpOnly cookie.** The web app's `auth.store` already keeps the access token in memory only.

- **Access token:** JWT HS256 signed with `JWT_SECRET`. Claims: `sub` (user id), `iat`, `exp`. Nothing else (role is read from the DB, see 2.3). Lifetime `JWT_EXPIRES_IN_SECONDS`, **default changes from 3600 to 900 (15 min)**, capped at the session's `expiresAt`: `exp = min(now + JWT_EXPIRES_IN_SECONDS, session.expiresAt)`, so no token outlives its session. Sent as `Authorization: Bearer`.
- **Refresh token:** 32 random bytes, base64url, in cookie `crm_refresh`. Only `sha256(token)` (hex) is stored, in `auth_sessions.tokenHash`.
  - Attributes: `HttpOnly; Path=/api/v1/auth; SameSite=<AUTH_COOKIE_SAMESITE>; Secure=<AUTH_COOKIE_SECURE>`; no `Domain` (host-only on the API host); `Max-Age` = seconds until session expiry.
  - **Fixed session lifetime: `AUTH_SESSION_TTL_HOURS`, default 12** (about one shift plus margin, OQ-PO-4). Refreshing does not extend it. After 12 h the user logs in again.
  - **Not rotated** on refresh in this slice. Rotation with reuse detection breaks with several tabs refreshing at once and needs a grace window; at this scale (one roastery, a few users) the gain is small. Revisit with OQ-PO-4.
- **Why not localStorage:** any XSS would read a long-lived token. Here XSS can at most use a 15-minute token while the page is open.
- **Hosting:** works without change if web and API are on subdomains of one domain (`app.x` + `api.x`, same-site, `SameSite=Lax`). If the domains end up fully different, set `AUTH_COOKIE_SAMESITE=none` (needs `Secure`); some browsers block such cookies, in which case the user stays logged in only until reload. **Needs the user's hosting answer** (open question in the brief).
- **CSRF:** `POST /auth/login`, `POST /auth/refresh` and `POST /auth/logout` require header `X-Requested-With: XMLHttpRequest`, else 403 `CSRF_HEADER_MISSING`. A custom header forces a CORS preflight, which only allowlisted origins pass. Other endpoints use the Bearer header, which browsers never send automatically. Login is included so another site cannot log a browser into an account of its choosing (login CSRF).

### 2.2 Passwords and login

- Hash with `node:crypto` `scrypt` (no native dependency). Stored as `scrypt$N$r$p$<salt b64>$<hash b64>` with N=2^15, r=8, p=1, 16-byte salt, 64-byte key. Compare with `timingSafeEqual`. Parameters are in the string, so they can be raised later.
- Email: `trim().toLowerCase()` before lookup and before any write. The DB enforces it (CHECK `users_email_normalised_chk`), so the existing `@unique` is case-insensitive (D-AR-3).
- Unknown email, wrong password and inactive user all return the same 401 `INVALID_CREDENTIALS`, and an unknown email still runs one scrypt against a fixed dummy hash so timing does not reveal which accounts exist.
- On success: create an `AuthSession` (`expiresAt = now + TTL`, `userAgent` truncated to 255), set the cookie, return the token body.

### 2.3 Guard behaviour and deactivation (A4, D-AR-2)

- `JwtAuthGuard` verifies the JWT, then loads the user by id (primary key lookup, one query per request; fine at this scale). If the user is missing or `isActive = false`, it returns 401 `UNAUTHENTICATED`.
- So **deactivation and role changes take effect on the user's next request**, not after the token expires. The 15-minute access-token lifetime is only the upper bound if this check is ever removed.
- `POST /auth/refresh` also rejects inactive users and revokes that session.

### 2.4 Login throttling (A6, Should, D-AR-9)

In-memory, per API process (single instance assumed; move to Postgres or Redis if we scale out):

- 5 failed logins for one email within 15 minutes: further attempts for that email are refused for 15 minutes.
- 30 failed logins from one IP within 15 minutes: same for that IP.
- Refusal: 429 `TOO_MANY_ATTEMPTS` with `Retry-After` (seconds). Checked before the password is verified. A successful login clears the email's counter.
- Known trade-off: anyone who knows a user's email can lock that user out for 15 minutes with 5 bad attempts. Accepted at this scale (internal staff, few users). Revisit with OQ-PO-4, e.g. per email+IP counters or CAPTCHA, if it happens in practice.
- Behind a proxy, client IP needs Express `trust proxy`; env `TRUST_PROXY` (hop count, default 0).

### 2.5 Permissions (D-PO-7, D-AR-4)

One map in `modules/auth/permissions.ts` is the only place the role matrix lives:

| Permission                | ADMIN | MANAGER | STAFF | Covers                                                          |
| ------------------------- | :---: | :-----: | :---: | --------------------------------------------------------------- |
| `customers:read`          |  Yes  |   Yes   |  Yes  | list, search, view customers and branches                       |
| `customers:write`         |  Yes  |   Yes   |  No   | create customer, edit details (names, ABN, email, phone, notes) |
| `customers:edit-terms`    |  Yes  |   Yes   |  No   | set `paymentTermsDays` on create or edit                        |
| `customers:deactivate`    |  Yes  |   Yes   |  No   | deactivate / reactivate customer                                |
| `branches:write`          |  Yes  |   Yes   |  No   | create branch, edit name and address                            |
| `branches:update-contact` |  Yes  |   Yes   |  Yes  | edit `contactName`, `contactPhone`, `deliveryNotes`             |
| `branches:deactivate`     |  Yes  |   Yes   |  No   | deactivate / reactivate branch                                  |

- Endpoints declare the permission they need with `@RequirePermission(...)`.
- **Field-level rules:** `PATCH /customers/:id` needs `customers:write`, and also `customers:edit-terms` if the body contains `paymentTermsDays`. `PATCH /branches/:id` needs `branches:update-contact`, and also `branches:write` if the body contains any field other than the three contact fields. The service checks with `hasPermission(user, p)` and returns 403 `FORBIDDEN` with `meta.fields` listing the disallowed fields. Nothing is written.
- `UserDto.permissions` sends the user's permissions to the web, which hides controls based on them. The web never copies the role matrix.

### 2.6 Seeding the first admin (D-AR-10)

`pnpm api db:seed` (Prisma seed via `prisma.config.ts` `migrations.seed`) reads `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_ADMIN_PASSWORD` (min 12 chars). It is idempotent: it creates the user as `ADMIN` if the email is missing, and does nothing (no password reset) if it exists. Unset vars: it exits with a clear message.

### 2.7 Env changes (`config/env.ts`)

| Var                      | Type / default                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `JWT_EXPIRES_IN_SECONDS` | default **900** (was 3600)                                                                           |
| `AUTH_SESSION_TTL_HOURS` | int 1..168, default 12                                                                               |
| `AUTH_COOKIE_SAMESITE`   | `lax` \| `strict` \| `none`, default `lax`                                                           |
| `AUTH_COOKIE_SECURE`     | boolean, default `true` when `NODE_ENV=production`, else `false`. `none` requires `true` (validate). |
| `CORS_ORIGINS`           | comma-separated origins, default empty (no CORS, dev uses the Vite proxy)                            |
| `TRUST_PROXY`            | int ≥ 0, default 0                                                                                   |

CORS (step 14 of the split design, now part of this slice): `app.enableCors({ origin: allowlist, credentials: true, allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'], exposedHeaders: ['Retry-After'] })` only when `CORS_ORIGINS` is set. Cookie parsing: `cookie-parser` or a small parser of the `Cookie` header, backend-developer's choice (mind the package-age policy).

## 3. Error contract (all endpoints, D-AR-5)

Every 4xx body keeps Nest's fields, so the web's existing `toApiError` keeps working, and adds `code`:

```ts
interface ApiErrorBody {
  statusCode: number;
  error: string; // HTTP reason phrase, e.g. "Conflict"
  code: string; // machine code, see table
  message: string; // one human-readable sentence, Australian English
  fieldErrors?: FieldError[];
  meta?: Record<string, unknown>;
}
interface FieldError {
  field: string; // DTO property, e.g. "abn"; nested as "a.b"
  code: string; // class-validator constraint or custom code, e.g. "isEmail", "abnChecksum"
  message: string; // user-facing, shown next to the field
}
```

- The global `ValidationPipe` gets an `exceptionFactory` that produces 400 `VALIDATION_FAILED` with `message: "Some fields need attention"` and one `fieldErrors` entry per field (first failing constraint only). Unknown fields (`forbidNonWhitelisted`) appear with code `whitelistValidation`; the web treats them as a developer bug.
- Change to the web (`shared/api/errors.ts`): read `code` and `fieldErrors` into `ApiError`. Old `details: string[]` can be derived from `fieldErrors[].message`.

| Status | `code`                | When                                                                                                                                                                                              |
| -----: | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    400 | `VALIDATION_FAILED`   | DTO validation (`fieldErrors` set)                                                                                                                                                                |
|    401 | `INVALID_CREDENTIALS` | login failed (any reason)                                                                                                                                                                         |
|    401 | `UNAUTHENTICATED`     | missing, invalid or expired access token; user inactive or deleted                                                                                                                                |
|    401 | `SESSION_EXPIRED`     | refresh cookie missing, unknown, revoked or expired                                                                                                                                               |
|    403 | `FORBIDDEN`           | missing permission (incl. field-level, `meta.fields`)                                                                                                                                             |
|    403 | `CSRF_HEADER_MISSING` | login/refresh/logout without `X-Requested-With`                                                                                                                                                   |
|    404 | `CUSTOMER_NOT_FOUND`  | unknown id **or malformed UUID** (F1: same 404 for both)                                                                                                                                          |
|    404 | `BRANCH_NOT_FOUND`    | same, for branches                                                                                                                                                                                |
|    409 | `ABN_TAKEN`           | ABN used by another customer (active or inactive). `fieldErrors: [{ field: 'abn', code: 'abnTaken', message: 'This ABN is already used by <displayName>' }]`, `meta: { customerId, displayName }` |
|    409 | `CUSTOMER_INACTIVE`   | reactivating a branch whose customer is inactive (E4)                                                                                                                                             |
|    429 | `TOO_MANY_ATTEMPTS`   | login throttled; `Retry-After` header                                                                                                                                                             |

Malformed UUIDs: do not use `ParseUUIDPipe` (it gives 400). Validate in the service and throw the 404.

## 4. Endpoints

All under `/api/v1`. All JSON. Timestamps are ISO 8601 UTC strings (`2026-11-19T05:52:51.000Z`); the web shows them in Sydney time. Nullable fields are always present as `null`, never omitted. No money or business dates in this slice.

### 4.1 Auth (`@Public()` except `me`)

| Method & path        | Request                        | 2xx response                                                                   | Errors                                                             |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `POST /auth/login`   | `LoginDto`, `X-Requested-With` | 200 `SessionDto` + `Set-Cookie`                                                | 400, 401 `INVALID_CREDENTIALS`, 403 `CSRF_HEADER_MISSING`, 429     |
| `POST /auth/refresh` | cookie, `X-Requested-With`     | 200 `SessionDto` (cookie unchanged)                                            | 401 `SESSION_EXPIRED` (+ clears cookie), 403 `CSRF_HEADER_MISSING` |
| `POST /auth/logout`  | cookie, `X-Requested-With`     | 204, revokes session, clears cookie. Idempotent: 204 with no or unknown cookie | 403 `CSRF_HEADER_MISSING`                                          |
| `GET /auth/me`       | Bearer                         | 200 `UserDto`                                                                  | 401                                                                |

```ts
// Request
interface LoginDto {
  email: string; // required, trimmed + lower-cased by the API, max 254. Not format-checked (any mismatch is just INVALID_CREDENTIALS).
  password: string; // required, 1..256 chars (cap bounds scrypt cost). Not trimmed.
}

// Responses
interface SessionDto {
  accessToken: string;
  expiresIn: number; // seconds until accessToken expires (never past sessionExpiresAt)
  sessionExpiresAt: string; // ISO timestamp; after this the user must log in again
  user: UserDto;
}
interface UserDto {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'STAFF';
  permissions: Permission[]; // e.g. ['customers:read', 'branches:update-contact']
}
```

Web flow (for whoever builds the web side): on app start call `POST /auth/refresh` (with `withCredentials: true`, as for login and logout); 200 → `setSession`, 401 → logged out. On a 401 from any other endpoint, do one single-flight refresh and retry the request once; if refresh fails, clear and go to `/login?redirect=…` with "Your session has expired". Schedule a refresh a minute before `expiresIn` runs out. Logout: call `/auth/logout`, then `auth.clear()` and `queryClient.clear()`.

### 4.2 Customers

| Method & path                    | Permission                                                              | Request              | 2xx                             | Errors                         |
| -------------------------------- | ----------------------------------------------------------------------- | -------------------- | ------------------------------- | ------------------------------ |
| `GET /customers`                 | `customers:read`                                                        | `ListCustomersQuery` | 200 `Page<CustomerListItemDto>` | 400                            |
| `POST /customers`                | `customers:write` (+ `customers:edit-terms` if `paymentTermsDays` sent) | `CreateCustomerDto`  | 201 `CustomerDto`               | 400, 403, 409 `ABN_TAKEN`      |
| `GET /customers/:id`             | `customers:read`                                                        |                      | 200 `CustomerDto`               | 404                            |
| `PATCH /customers/:id`           | `customers:write` (+ `customers:edit-terms` if `paymentTermsDays` sent) | `UpdateCustomerDto`  | 200 `CustomerDto`               | 400, 403, 404, 409 `ABN_TAKEN` |
| `POST /customers/:id/deactivate` | `customers:deactivate`                                                  | no body              | 200 `CustomerDto`               | 403, 404                       |
| `POST /customers/:id/reactivate` | `customers:deactivate`                                                  | no body              | 200 `CustomerDto`               | 403, 404                       |
| `POST /customers/:id/branches`   | `branches:write`                                                        | `CreateBranchDto`    | 201 `BranchDto`                 | 400, 403, 404                  |

No `DELETE` routes (D-PO-2). `isActive` cannot be set through `PATCH` (it is not in the DTO, so `forbidNonWhitelisted` rejects it).

```ts
interface ListCustomersQuery {
  page?: number; // int ≥ 1, default 1
  pageSize?: number; // int 1..100, default 25
  search?: string; // trimmed; empty = no search; max 100
  status?: 'active' | 'inactive' | 'all'; // default 'active'
  state?: AustralianState; // Should (B4): customers with at least one ACTIVE branch in this state
}

interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number; // 0 when totalItems is 0
}

interface CustomerListItemDto {
  id: string;
  displayName: string; // tradingName ?? legalName (computed, not stored)
  legalName: string;
  tradingName: string | null;
  abn: string | null; // 11 digits, no spaces; the web formats it
  billingEmail: string;
  phone: string | null;
  paymentTermsDays: number;
  isActive: boolean;
  activeBranchCount: number;
  updatedAt: string;
}

interface CustomerDto extends CustomerListItemDto {
  notes: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  branches: BranchDto[]; // active first, then inactive; each group by name, case-insensitive
}

interface CreateCustomerDto {
  legalName: string; // required, 1..200 after trim
  tradingName?: string | null; // 0..200 after trim; '' -> null
  abn?: string | null; // spaces removed, then '' -> null; else must match /^\d{11}$/ and pass the ATO checksum
  billingEmail: string; // required, trimmed, valid email, max 254. Stored as typed (not lower-cased).
  phone?: string | null; // 0..30 after trim; '' -> null; free text in this slice
  paymentTermsDays?: number; // int 0..90, default 14 (constants PAYMENT_TERMS_DEFAULT_DAYS / _MAX_DAYS)
  notes?: string | null; // 0..2000 after trim; '' -> null
}

type UpdateCustomerDto = Partial<CreateCustomerDto>; // legalName and billingEmail may be omitted but not null/blank
```

Validation messages (Australian English, used as `fieldErrors[].message`):

- ABN with anything other than digits and spaces, or not 11 digits: `ABN must be 11 digits` (code `abnFormat`).
- Checksum fails: `This isn't a valid ABN — check for a typo` (code `abnChecksum`).
- Payment terms outside 0..90 or not whole: `Payment terms must be a whole number of days from 0 to 90`.
- Blank legal name: `Legal name is required`. Bad email: `Enter a valid email address`.

ABN checksum (D-PO-1, brief C2): subtract 1 from the first digit, multiply digits by `10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19`, sum, must be divisible by 89. `51824753556` is valid. Implement once as a custom class-validator decorator in `customers` (the web has its own copy).

**List query semantics (D-AR-6):**

- `status`: `active` → `isActive = true`; `inactive` → `false`; `all` → no filter.
- `search` (trimmed `t`, with `%`, `_` and `\` escaped):
  - `legalName ILIKE %t%` OR `tradingName ILIKE %t%`
  - OR (Should, B2) any branch (active or not) with `name ILIKE %t%` or `suburb ILIKE %t%`
  - OR, only if `t` matches `/^[\d ]+$/`: `abn LIKE %digits%` where `digits` = `t` without spaces.
- Order: `lower(coalesce(tradingName, legalName)) ASC, id ASC`. Prisma `orderBy` cannot express this, so use one `$queryRaw` (built with `Prisma.sql` fragments, no string concatenation) that returns the page of ids plus `count(*) over ()`, then `findMany({ where: { id: { in } } })` with the active-branch `_count`, re-ordered in memory.
- A page past the end returns `items: []` with the real `totalItems`/`totalPages`. The web then navigates to the last page (F1). The API does not clamp.
- Indexes: `customers.isActive`, `branches.state`, `branches.customerId` exist. `ILIKE '%…%'` cannot use a btree index; at tens to hundreds of customers (OQ-PO-5) a sequential scan is sub-millisecond. Add `pg_trgm` GIN indexes only if the answer is thousands.

### 4.3 Branches

| Method & path                   | Permission                                                         | Request           | 2xx             | Errors                            |
| ------------------------------- | ------------------------------------------------------------------ | ----------------- | --------------- | --------------------------------- |
| `PATCH /branches/:id`           | `branches:update-contact` (+ `branches:write` for any other field) | `UpdateBranchDto` | 200 `BranchDto` | 400, 403, 404                     |
| `POST /branches/:id/deactivate` | `branches:deactivate`                                              | no body           | 200 `BranchDto` | 403, 404                          |
| `POST /branches/:id/reactivate` | `branches:deactivate`                                              | no body           | 200 `BranchDto` | 403, 404, 409 `CUSTOMER_INACTIVE` |

Branches are read through `GET /customers/:id`; there is no separate list or get. Both controllers live in the `customers` module.

```ts
interface BranchDto {
  id: string;
  customerId: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  suburb: string;
  state: AustralianState; // 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT'
  postcode: string; // exactly 4 digits, e.g. "0800"
  contactName: string | null;
  contactPhone: string | null;
  deliveryNotes: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateBranchDto {
  name: string; // required, 1..200 after trim
  addressLine1: string; // required, 1..200
  addressLine2?: string | null; // 0..200; '' -> null
  suburb: string; // required, 1..100
  state: AustralianState; // required
  postcode: string; // required, trimmed, /^\d{4}$/ -> "Postcode must be 4 digits"
  contactName?: string | null; // 0..200
  contactPhone?: string | null; // 0..30
  deliveryNotes?: string | null; // 0..2000
}

type UpdateBranchDto = Partial<CreateBranchDto>; // no customerId (D-PO-5): sending it is a 400 (unknown field)
```

## 5. Behaviour rules and edge cases (for backend-developer and qa-engineer)

1. **Trimming:** every string field is trimmed; optional fields that are blank after trim become `null`; required fields that are blank fail with "… is required". `password` is never trimmed.
2. **ABN duplicates:** check before write for a friendly 409 that names the existing customer, and also map Prisma `P2002` on `abn` to the same 409 (race between two saves). Saving a customer with its own ABN unchanged is not a conflict.
3. **Deactivate/reactivate are idempotent:** deactivating an inactive customer returns 200 and keeps the original `deactivatedAt`. Reactivate sets `isActive = true`, `deactivatedAt = null`. Branch `isActive` is never touched by customer (de)activation (D-PO-4).
4. **Inactive customers:** can still be viewed, edited and get new branches (D1, E1). Their branches can be deactivated, but not reactivated (409 `CUSTOMER_INACTIVE`).
5. **`activeBranchCount`** counts branches with `isActive = true`, regardless of the customer's status.
6. **Field-level 403:** a STAFF `PATCH /branches/:id` with `{ "deliveryNotes": "x", "postcode": "2000" }` is 403 and changes nothing (not a partial save). STAFF `PATCH` with only contact fields is 200.
7. **Payment terms:** `0` is valid (due on issue). Omitted on create → 14. Omitted on update → unchanged.
8. **Concurrency:** last save wins (C3). No ETags in this slice.
9. **404s:** malformed UUID and unknown UUID give the same 404 code.
10. **Auth edge cases:** email with capitals/spaces logs in; inactive user gets `INVALID_CREDENTIALS`; a user deactivated mid-session gets 401 `UNAUTHENTICATED` on the next request and 401 `SESSION_EXPIRED` on refresh; a session past `expiresAt` cannot be refreshed even if the cookie is still sent; logout revokes only the current session.
11. **Throttling:** the 6th failed attempt for one email in 15 minutes is 429 even with the right password; the counter is per lower-cased email.
12. **Timezone:** no business dates here. `deactivatedAt`, `createdAt`, `updatedAt` are UTC instants. A deactivation at 23:30 Sydney time on 30 Nov is `…T12:30:00.000Z` (AEDT, UTC+11).

## 6. Schema changes (migration `20261119060443_auth_sessions_and_customer_deactivation`, applied)

- New model `AuthSession` (`auth_sessions`): `userId` FK (cascade on user delete), `tokenHash` unique, `expiresAt`, `revokedAt`, `lastUsedAt`, `userAgent`. Indexes on `userId` and `expiresAt` (for a later cleanup job).
- `Customer.deactivatedAt`, `Branch.deactivatedAt` (`timestamptz`, nullable). This covers the "when" of D1. The "why" waits for OQ-PO-6; use `notes` until then.
- Indexes: `customers(isActive)`, `branches(state)`.
- Hand-written CHECK constraints (Prisma neither models nor drops them; verified no drift):
  - `users_email_normalised_chk`: `email = lower(btrim(email))` (existing rows normalised first). The normalising `UPDATE` fails, and the migration aborts, if two existing users differ only by case or spaces; fine on a fresh DB, but check for such duplicates before applying it to real data. JS `toLowerCase()` and Postgres `lower()` can differ for some non-ASCII characters depending on collation, so such an email fails the CHECK (500 on seed or insert). Negligible for staff emails; the seed script should reject non-ASCII emails with a clear message.
  - `customers_abn_format_chk`: `abn IS NULL OR abn ~ '^[0-9]{11}$'`.
  - `branches_postcode_format_chk`: `postcode ~ '^[0-9]{4}$'`.
- Not changed: `abn @unique` (OQ-PO-2), `paymentTermsDays` has no DB range (range is an assumption, OQ-PO-3, enforced in the DTO only), no `createdBy`/`updatedBy` (next slice, G27).

## 7. OpenAPI

Accurate `@ApiProperty` on every DTO, with `nullable: true` for `| null` fields and `enum` for `role`, `state`, `status`, `permissions`. Document the error body once as `ApiErrorBody`. The `openapi:emit` script (split design step 12) is not built yet; until it is, the web hand-writes types matching section 4.

## 8. UI notes (for the web owner)

- Query keys: `['auth', 'me']`; `customerKeys.list({ page, pageSize, search, status, state })`; `customerKeys.detail(id)`. Mutations on a customer or its branches invalidate `customerKeys.detail(id)` and `customerKeys.lists()`.
- Hide controls with `user.permissions`, never with `user.role`.
- `ApiError` needs `code` and `fieldErrors` (section 3) for field-level messages and the ABN link (`meta.customerId`).
- Axios `withCredentials: true` on `/auth/login`, `/auth/refresh` and `/auth/logout` only. Login needs it too: cross-origin, the browser ignores the login response's `Set-Cookie` without credentials. All three must also send `X-Requested-With: XMLHttpRequest`.
- `GET /auth/me` is optional for the web: `SessionDto` from login and refresh already carries `user` and `permissions`, and the app starts with a refresh.
