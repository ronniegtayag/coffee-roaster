# Auth and customers (first CRM slice)

## Goal

Staff can log in to the web app and manage customers (the billed business) and their branches (the cafe locations): list, search, create, edit, deactivate. This is the first real feature on top of the shell and health page.

## Scope

- In:
  - API `auth` module: login (email + password), current user (`GET /auth/me`), JWT guard applied globally, role guard (`ADMIN` / `MANAGER` / `STAFF`). Uses the existing `User` model.
  - API `customers` module: CRUD for `Customer` and `Branch`. Paginated list with search by name/ABN. ABN validation (11 digits, ATO checksum). Soft delete via `isActive`.
  - Web: login page, auth guard on routes, customers list (paginated, search and filters in URL search params), create/edit customer and branch forms.
  - Tests for all of the above.
- Out (waiting on the roaster's answers in `docs/domain/questions-for-roaster.md`):
  - Customer pricing, standing orders, delivery days and roast dates, orders, invoicing and payments (Q1 to Q6 decide these).
  - User management screens (seed an admin user for now).
  - Any schema change that depends on those answers.

## Context

- Customer basics (name, ABN, contact, branches) don't depend on the open roaster questions (`docs/design/frontend-backend-split.md`, M2).
- `Customer.abn` is `@unique`. Q4 asks whether one company can be billed as more than one customer. Do not loosen or tighten this constraint now; flag it if it gets in the way.
- Payment terms default to 14 days, which is a guess (Q8). Expose the field, do not treat 14 as settled.
- Auth token storage is an open decision in the design doc (section on open questions): recommended access token in memory plus refresh token in an httpOnly cookie. The architect settles this.
- Web and API are hosted separately, so the API needs CORS and the cookie settings must work cross-origin. Hosting domains are not decided yet.
- All user-visible text and validation must use Sydney/AUD conventions from `CLAUDE.md`.

## Acceptance criteria

Owner: product-owner. Labels follow `docs/domain/wholesale-roaster-flow.md`: **[Confirmed]**, **[Common practice]**, **[Assumption — confirm with roaster]**. Priority: **Must** (this slice), **Should** (this slice if cheap, else next), **Later**.

Roles used in the stories:

- **Owner** (roaster/owner): runs the business. Maps to `ADMIN`.
- **Account manager** (sales): onboards and looks after cafe accounts. Maps to `MANAGER`.
- **Production staff** (roasting, packing, dispatch): needs delivery details. Maps to `STAFF`.
- **Bookkeeper**: needs billing details (legal name, ABN, billing email, terms). Role mapping unknown, see OQ-PO-1.

### Role permissions (proposed)

**[Assumption — confirm with roaster]** (Q14: who will use the system). The split below follows **[Common practice]**: anyone in the roastery can look up an account and its delivery details, but only people who manage accounts change billing details or deactivate an account. Build it so the matrix is easy to change.

| Action                                                                   | ADMIN | MANAGER | STAFF |
| ------------------------------------------------------------------------ | :---: | :-----: | :---: |
| Log in, see own profile (`/auth/me`), log out                            |  Yes  |   Yes   |  Yes  |
| List, search, view customers and branches (active and inactive)          |  Yes  |   Yes   |  Yes  |
| Create customer                                                          |  Yes  |   Yes   |  No   |
| Edit customer details (names, ABN, billing email, phone, notes)          |  Yes  |   Yes   |  No   |
| Edit customer payment terms                                              |  Yes  |   Yes   |  No   |
| Deactivate / reactivate customer                                         |  Yes  |   Yes   |  No   |
| Create branch, edit branch address                                       |  Yes  |   Yes   |  No   |
| Edit branch contact name/phone and delivery notes                        |  Yes  |   Yes   |  Yes  |
| Deactivate / reactivate branch                                           |  Yes  |   Yes   |  No   |
| Manage users (create, change role, deactivate) — out of scope, seed only |  Yes  |   No    |  No   |

Why STAFF may edit branch contact and delivery notes: drivers and packers are usually the first to learn "new head barista, call Sam" or "use the back lane after 7 am". Blocking that edit pushes the information back onto paper. **[Common practice]**, but the specific grant is **[Assumption — confirm with roaster]**.

### A. Authentication

**A1 (Must).** As any staff member, I want to log in with my email and password so that only roastery staff can see customer data.

- Given an active user with a correct email and password, when they log in, then they land on the page they originally asked for (or the customers list by default) and their name and role are shown.
- Given the email is typed with different upper/lower case or surrounding spaces, when they log in, then it is matched case-insensitively after trimming.
- Given a wrong password, an unknown email, or a deactivated user, when they log in, then the same generic message is shown ("Email or password is incorrect") so the response does not reveal which accounts exist.
- Given an empty email or password, when they submit, then the form shows a field error and no request is sent.
- Given the API is unreachable, when they log in, then the page says the service can't be reached and to try again, and the typed email is kept.

**A2 (Must).** As any staff member, I want every page and API call to require login so that a lost tablet or a guessed URL does not expose customer data.

- Given no valid session, when any `api/v1` endpoint other than login and `/health` is called, then it returns 401.
- Given no valid session, when a protected web route is opened, then the user is sent to login, and after logging in is returned to that route (including its search params).
- Given a session expires while the user is on a page, when their next request returns 401, then they are sent to login with a "Your session has expired" message, and unsaved form input is not silently submitted.

**A3 (Must).** As any staff member, I want to log out so that the next person on a shared roastery tablet can't act as me.

- Given a logged-in user, when they log out, then they return to login and pressing Back does not show customer data.
- Session length on shared devices: **[Assumption — confirm with roaster]** (OQ-PO-4). Until answered, follow the architect's token lifetime.

**A4 (Must).** As the owner, I want a deactivated user to lose access so that a staff member who has left can no longer get in.

- Given a user with `isActive = false`, when they try to log in, then login fails as in A1.
- Given a user is deactivated while logged in, when their session next refreshes (at the latest), then access is refused. The maximum delay is the architect's access-token lifetime, which must be recorded in Decisions.

**A5 (Must).** As any staff member, I want to see only the actions my role allows so that I am not offered buttons that will fail.

- Given a STAFF user, when they view a customer, then Create / Edit customer / Deactivate controls are not shown, and Edit branch shows only contact and delivery notes as editable.
- Given a STAFF user calls a forbidden endpoint directly, when the API receives it, then it returns 403 and changes nothing. The UI hiding is a convenience; the API is the enforcement.
- Given a 403 reaches the web app, when it is shown, then the message says "You don't have permission to do this" (not a generic error).

**A6 (Should).** As the owner, I want repeated failed logins to be slowed down so that passwords can't be guessed by brute force.

- Given many failed attempts for one email or IP in a short window, when another attempt is made, then it is rejected for a cooling-off period with a message saying to try again later. Thresholds: architect's choice.

### B. Customers: list and search

**B1 (Must).** As an account manager, I want a paginated list of customers so that I can find an account quickly.

- Given customers exist, when the list opens, then by default it shows **active** customers sorted by display name (trading name if set, else legal name), A to Z, case-insensitive.
- Each row shows: display name, legal name (if different), ABN formatted `12 345 678 901` (or "No ABN"), billing email, number of active branches, and an Inactive badge where relevant.
- Given more customers than one page, when the user changes page, then the page number is in the URL, and reloading or sharing the URL shows the same page.
- Expected scale: tens to low hundreds of customers, a few branches each. **[Assumption — confirm with roaster]** (Q17).

**B2 (Must).** As an account manager, I want to search by name or ABN so that I can find "that cafe in Surry Hills" or match an ABN from a remittance.

- Given a search term, when it is applied, then customers match on a case-insensitive partial match of legal name or trading name.
- Given a term made only of digits and spaces, when it is applied, then spaces are ignored and it also matches ABNs that start with or contain those digits (e.g. `51 824` and `51824` both find `51824753556`).
- Given a search term, when it is applied, then it is in the URL, the list goes back to page 1, and the active/inactive filter is kept.
- **(Should)** Search also matches branch name and suburb, so "Surry Hills" finds the customer whose branch is there.

**B3 (Must).** As an account manager, I want to filter by status so that I can find a lapsed account to reactivate.

- Filter values: Active (default), Inactive, All. The filter is in the URL.

**B4 (Should).** As an account manager, I want to filter by branch state so that I can see interstate accounts that need a courier.

### C. Customers: create and edit

**C1 (Must).** As an account manager, I want to create a customer so that a new cafe account can be set up before its first order.

- Required: legal name, billing email. Optional: trading name, ABN, phone, payment terms, notes.
- Given valid input, when saved, then the customer is created as active, and the user lands on the customer's page with a prompt to add the first branch.
- Given a customer is saved with no branches, then that is allowed (onboarding is often in progress). Decision D-PO-3.
- Given payment terms are left blank, then the default (currently 14 days) is applied, and the form labels it as the default rather than a business rule. 14 days is **[Assumption — confirm with roaster]** (Q8).
- Given the billing email is not a valid email address, then a field error is shown.
- Given leading/trailing spaces in any text field, then they are trimmed before saving. An all-spaces legal name counts as empty.

**C2 (Must).** As an account manager, I want ABNs validated so that invoices carry a real ABN and typos are caught at entry.

- Given an ABN typed with spaces (`51 824 753 556`), when saved, then it is stored as 11 digits with no spaces and shown formatted. **[Confirmed]** ABNs are 11 digits ([ABR: ABN format](https://abr.business.gov.au/Help/AbnFormat)).
- Given an ABN with letters, other punctuation, or not exactly 11 digits after removing spaces, then a field error says "ABN must be 11 digits".
- Given 11 digits that fail the ATO checksum, then a field error says "This isn't a valid ABN — check for a typo". **[Confirmed]** algorithm: subtract 1 from the first digit, multiply each digit by weights 10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, sum, and the total must be divisible by 89. Test value: `51 824 753 556` is valid ([ABR: ABN format](https://abr.business.gov.au/Help/AbnFormat)). The same rule applies in the web form and the API.
- Given the ABN field is left blank, then the customer saves without an ABN. A buyer ABN (or identity) is only required on tax invoices of $1,000 or more ([ATO tax invoices](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices)), and sole traders may not have given one yet. **[Confirmed]** for the threshold. Decision D-PO-1.
- Given an ABN already used by another customer (active **or inactive**), when saved, then it is rejected with "This ABN is already used by <display name>" and a link to that customer. The brief keeps `abn @unique` unchanged; whether one ABN may be billed as several customers is Q4. **[Assumption — confirm with roaster]**.
- A checksum-valid ABN can still be cancelled or belong to someone else. Checking against the ABR (ABN Lookup web service) is **Later** ([ABN Lookup web services](https://abr.business.gov.au/Tools/WebServices)).

**C3 (Must).** As an account manager, I want to edit a customer so that I can fix details and record changes (new billing email, new trading name).

- Same validation as C1/C2. Given another user changed the record in the meantime, then last save wins for this slice. **(Later)** conflict warning.
- Given payment terms are changed, then the change applies to future invoices only. (There are no invoices yet; recorded so invoicing respects it.) **[Common practice]**.
- Payment terms allowed range: whole days, 0 to 90, where 0 means due on issue. **[Assumption — confirm with roaster]** (Q8). End-of-month terms are not representable yet (gap G15).

### D. Customers: deactivate and reactivate

**D1 (Must).** As an account manager, I want to deactivate a customer who has stopped buying so that they drop out of day-to-day lists without losing their history.

- Given an active customer, when deactivated (after a confirmation dialog naming the customer), then `isActive` becomes false, it disappears from the default list, and it is still found with the Inactive or All filter and by direct URL.
- Nothing is ever hard-deleted in this slice: there is no delete endpoint or button for customers or branches. Invoices must be kept for 5 years ([ATO GST records](https://www.ato.gov.au/Business/Record-keeping-for-business/Detailed-business-record-keeping-requirements/Running-your-business---records/Business-activity-statement-records/GST-records/)), so the billed entity must remain. **[Confirmed]** for retention. Decision D-PO-2.
- Given a customer is deactivated, then its branches are treated as unavailable for new orders, but each branch's own `isActive` is **not** changed, so reactivating the customer restores the branches as they were. Decision D-PO-4.
- Given an inactive customer, when viewed, then a clear Inactive banner is shown and edits are still allowed (fixing an email on a lapsed account is normal).
- **(Should)** Record why and when (e.g. "closed", "moved to another roaster", "unpaid"). The schema has no field for this (gap below); free-text `notes` is the stopgap.
- Future rule, recorded for the orders slice: an inactive customer or branch cannot receive new orders. Credit hold (G14) is a different state from inactive and must not reuse `isActive`. **[Common practice]**.

**D2 (Must).** As an account manager, I want to reactivate a customer so that a returning cafe keeps its history and ABN.

- Given an inactive customer, when reactivated, then it returns to the default list with its branches as they were.

### E. Branches

**E1 (Must).** As an account manager, I want to add a branch (cafe venue) to a customer so that orders can be delivered to the right place.

- Required: branch name, address line 1, suburb, state, postcode. Optional: address line 2, contact name, contact phone, delivery notes.
- State is one of NSW, VIC, QLD, WA, SA, TAS, ACT, NT. Postcode is exactly 4 digits, kept as text so leading zeros (`0800` Darwin) survive. **[Confirmed]** Australian postcodes are 4 digits ([Australia Post](https://auspost.com.au/postcode)).
- **(Later)** Warn (not block) if the postcode doesn't fit the state (e.g. NSW postcodes start with 1 or 2).
- Given a single-venue cafe, then the branch name may be the same as the trading name. **(Should)** Pre-fill the branch name with the customer's display name for the first branch.
- Given an inactive customer, when adding a branch, then it is allowed (preparing a returning account), but the banner from D1 stays.
- Delivery notes hold free text such as access instructions, delivery window, key/lockbox and "leave with neighbouring shop". Structured delivery days and windows are out of scope (Q6, G4).

**E2 (Must).** As production staff, I want to see each branch's address, contact and delivery notes so that I can pack and deliver to the right venue.

- Given a customer with branches, when viewed, then active branches are listed first, then inactive ones (badged), each showing full address, contact and delivery notes.
- Given a customer with no branches, then an empty state says "No branches yet" with an Add branch button (for roles allowed to add).

**E3 (Must).** As an account manager, I want to edit a branch so that address and contact changes are kept current. STAFF may edit only contact name, contact phone and delivery notes (see the role table).

- A branch cannot be moved to a different customer in this slice. If a venue changes owner, deactivate it and create it under the new customer, so past orders stay with the old billed entity. **[Common practice]**. Decision D-PO-5.

**E4 (Must).** As an account manager, I want to deactivate a branch that has closed so that it is not chosen for new orders.

- Given an active branch, when deactivated (after confirmation), then it shows as inactive under its customer and is excluded from future order entry. The customer stays active even if it has no active branches left.
- Reactivate works the same way, and is only offered while the customer is active (otherwise reactivate the customer first).

### F. Empty and error states (web)

**F1 (Must).** Every list, page and form handles these cases with a specific message:

| Case                                              | Expected behaviour                                                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| No customers at all (new install)                 | "No customers yet" with Create customer for ADMIN/MANAGER; STAFF see "Ask a manager to add customers".                                  |
| Search/filter returns nothing                     | "No customers match '<term>'" with a Clear search action; filters stay visible.                                                         |
| Default (Active) filter empty, but inactive exist | "No active customers" with a link to show inactive.                                                                                     |
| Page number beyond the last page (URL)            | Show the last page (or page 1 if empty) rather than an error.                                                                           |
| Customer/branch id not found                      | 404 page "Customer not found" with a link back to the list. Same for an id in the wrong format.                                         |
| Validation error from the API (400)               | Field-level messages next to the fields, form input kept. Unknown fields rejected by the API are a developer bug, not user-facing text. |
| Duplicate ABN (409 or equivalent)                 | Field error on ABN naming the existing customer (C2).                                                                                   |
| 401 / 403                                         | As A2 / A5.                                                                                                                             |
| Network or 5xx                                    | "Something went wrong — try again", with Retry; form input kept; nothing is shown as saved unless the API confirmed it.                 |
| Double-click on Save                              | Only one customer/branch is created (button disabled while saving).                                                                     |
| Loading                                           | Skeleton or spinner; the previous page of results stays visible while the next loads.                                                   |

All text is Australian English; ABNs show as `12 345 678 901`; timestamps such as "last updated" show in Sydney time (`CLAUDE.md`).

### G. Later (not this slice, recorded so nobody builds it by accident)

- User management screens (seeded admin only).
- Several contacts per customer/branch, such as an accounts email separate from the ordering contact (G16).
- Who changed what (`createdBy`/`updatedBy`, G27). **Should** for the next slice, since payment terms and deactivation need accountability.
- ABN Lookup verification, GST-registration status of the customer, import of an existing customer list (Q17).
- Credit hold, credit limit, EOM terms (G14, G15).

### Gaps in `schema.prisma` for this slice

Nothing here blocks the Must stories. Gaps the architect should know about:

1. No reason/date for deactivation on `Customer` or `Branch` (D1 Should). Stopgap: `notes`.
2. `Branch` has no email; `Customer` has one `billingEmail` only (G16).
3. No `createdBy`/`updatedBy` (G27).
4. `abn @unique` includes inactive customers, so a returning cafe re-created as a new record collides; the UX answer is "reactivate the old one" (C2, D2). Q4 may change this.
5. `User.email` uniqueness is case-sensitive at the DB level; A1 needs case-insensitive matching (architect decides how).
6. `paymentTermsDays` has no range limit and cannot express EOM terms (G15).

## Decisions

<!-- Teammates append here when they settle something others depend on. -->

- **D-PO-1 (product-owner):** ABN is optional on a customer. When present it is stored as 11 digits without spaces, must pass the ATO checksum, and is displayed `12 345 678 901`. Same rule in web and API.
- **D-PO-2 (product-owner):** No hard delete of customers or branches. Deactivate/reactivate only, via `isActive`.
- **D-PO-3 (product-owner):** A customer may exist with zero branches.
- **D-PO-4 (product-owner):** Deactivating a customer does not change its branches' `isActive`; the customer's status overrides for availability. Reactivation restores the previous branch states.
- **D-PO-5 (product-owner):** A branch cannot be moved between customers.
- **D-PO-6 (product-owner):** Customer list defaults to active customers, sorted by display name (trading name, else legal name). Search matches names (partial, case-insensitive) and ABN digits ignoring spaces. Page, search and status filter live in the URL.
- **D-PO-7 (product-owner):** The role matrix in "Role permissions (proposed)" is the working default. It is an assumption (OQ-PO-1) and must be easy to change; the API enforces it, the UI only hides controls.
- **D-AR-1 (architect):** Design note: `docs/design/auth-and-customers.md`. Token storage: JWT access token in memory (15 min, `JWT_EXPIRES_IN_SECONDS=900`) + opaque refresh token in an httpOnly cookie `crm_refresh` (`Path=/api/v1/auth`, `SameSite=Lax` by default), backed by an `auth_sessions` row. Sessions last a fixed 12 h from login (`AUTH_SESSION_TTL_HOURS`), not extended by refresh, refresh token not rotated. An access token never expires after its session (`exp` capped at the session's `expiresAt`). Login, refresh and logout require `X-Requested-With: XMLHttpRequest` (403 `CSRF_HEADER_MISSING` without it). Assumes web and API share a parent domain; otherwise set `AUTH_COOKIE_SAMESITE=none`.
- **D-AR-2 (architect):** The JWT guard loads the user on every request, so deactivation and role changes take effect on the next request (A4). Maximum delay if that check is ever dropped: 15 minutes.
- **D-AR-3 (architect):** User emails are stored trimmed and lower-cased, enforced by a DB CHECK, so `users.email @unique` is case-insensitive. Login normalises the same way.
- **D-AR-4 (architect):** The role matrix lives only in `modules/auth/permissions.ts` as named permissions (`customers:read`, `customers:write`, `customers:edit-terms`, `customers:deactivate`, `branches:write`, `branches:update-contact`, `branches:deactivate`). `UserDto.permissions` sends them to the web; the web hides controls by permission, never by role. Field-level checks: `paymentTermsDays` needs `customers:edit-terms`; branch fields other than contact name/phone/delivery notes need `branches:write`; a disallowed field makes the whole request 403.
- **D-AR-5 (architect):** Error body is Nest's `{ statusCode, error, message }` plus `code` and optional `fieldErrors: { field, code, message }[]` and `meta`. Codes and statuses in the design note §3. Malformed and unknown ids both return 404.
- **D-AR-6 (architect):** List contract: `GET /customers?page&pageSize&search&status=active|inactive|all&state`, page 1-based, `pageSize` default 25, max 100. Response `{ items, page, pageSize, totalItems, totalPages }`. A page past the end returns empty `items` (the web goes to the last page). Search includes branch name/suburb (B2 Should). `state` filter (B4 Should) matches customers with an active branch in that state.
- **D-AR-7 (architect):** Endpoints: customer create/get/patch at `/customers[/:id]`, `POST /customers/:id/deactivate|reactivate`, `POST /customers/:id/branches`, `PATCH /branches/:id`, `POST /branches/:id/deactivate|reactivate`. No DELETE. `isActive` is only changed through the action endpoints. Reactivating a branch of an inactive customer is 409 `CUSTOMER_INACTIVE`.
- **D-AR-8 (architect):** `Customer.deactivatedAt` and `Branch.deactivatedAt` added (set on deactivate, cleared on reactivate). No reason field until OQ-PO-6 is answered. DB CHECKs enforce ABN = 11 digits and postcode = 4 digits. `abn @unique` and `paymentTermsDays` are unchanged; the 0 to 90 range is DTO-only.
- **D-AR-9 (architect):** Login throttling (A6): 5 failures per email or 30 per IP in 15 minutes → 429 `TOO_MANY_ATTEMPTS` with `Retry-After`, 15-minute cool-off. In memory (single API instance). Accepted trade-off: someone who knows a user's email can lock them out for 15 min.
- **D-AR-10 (architect):** First admin is created by an idempotent `pnpm api db:seed` from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_NAME`/`SEED_ADMIN_PASSWORD`. Passwords are hashed with `node:crypto` scrypt.
- **D-AR-11 (architect):** CORS (split design step 14) is part of this slice: `CORS_ORIGINS` allowlist, `credentials: true`.
- **D-BE-1 (backend-developer):** Auth and customers/branches API implemented as designed (all endpoints in design §4). Deviations and details: (a) no `cookie-parser`; `modules/auth/cookies.ts` parses the `Cookie` header. (b) `modules/auth` uses `@nestjs/jwt` only; custom guards, no passport. (c) `Env` type now has `AUTH_COOKIE_SECURE: boolean` and `CORS_ORIGINS: string[]` (parsed in `validateEnv`); `none` + non-secure fails startup. (d) `common/api-exception.filter.ts` is registered globally in `configureApp`: it sets `Retry-After` and adds a default `code` (`NOT_FOUND`, `BAD_REQUEST`, ...) to Nest's own 4xx. (e) `PATCH` with `legalName`/`billingEmail`/branch required fields set to `null` returns 400 `VALIDATION_FAILED`. (f) `GET /customers` past the last page returns empty `items` (not clamped), as designed. (g) Seed: `pnpm api db:seed` runs `nest build` then `node dist/seed` (`src/seed.ts`), because the generated Prisma client's `.js` imports do not load under ts-node. (h) Local `apps/api/.env` still has `JWT_EXPIRES_IN_SECONDS=3600`; remove it to get the new 900 default. For local dev set `CORS_ORIGINS=http://localhost:5173` (already in `.env.example`) and keep `AUTH_COOKIE_SAMESITE=lax` (localhost ports are same-site).

## Open questions

Product-owner questions for the user/roaster (these do not block the Must stories; defaults above apply until answered):

- **OQ-PO-1 (Q14):** Who will use the system, and does the role table match how the roastery works? In particular: should production staff be read-only, or edit branch contact and delivery notes as proposed? Is the bookkeeper a MANAGER or should they have their own role?
- **OQ-PO-2 (Q4):** Can one company (one ABN) be billed as two separate customers, e.g. two brands under one Pty Ltd? If yes, `abn @unique` must change.
- **OQ-PO-3 (Q8):** What payment terms are actually used? Is 14 days the right default, and is 0 to 90 days a sensible range? Are end-of-month terms used?
- **OQ-PO-4:** Are tablets on the roastery floor shared between staff? If so, how long should a login stay valid before asking again (e.g. end of shift)?
- **OQ-PO-5 (Q17):** Where is the customer list today and roughly how many accounts and venues? (Scale and a possible import.)
- **OQ-PO-6:** When a cafe stops buying, do you want to record why (closed, moved roaster, unpaid)?

Technical and process questions:

- Auth token storage: in-memory access token + httpOnly refresh cookie, or a simpler approach? (architect to recommend; user to confirm if it affects hosting) — **Recommended in D-AR-1; user to confirm.** It works out of the box only if web and API share a parent domain (next question).
- ~~Hosting provider and whether web and API share a parent domain~~ Settled by the user: no deployment yet, everything runs locally. Design for local dev (web and API on different localhost ports, so CORS is still needed) and revisit cookie `SameSite` when hosting is chosen.
- ~~Who owns `apps/web` feature code?~~ Settled by the user: `frontend-developer` owns the web UI (role added in `.claude/agents/frontend-developer.md`).
- `openapi:emit` (generated web API types): deferred to the next slice (lead's call, pending user objection). The web keeps hand-written types in `features/customers/types.ts` until then; the switch is a single import change.
- ~~How is the first admin user created?~~ Settled: `pnpm api db:seed` (see D-BE-1).
