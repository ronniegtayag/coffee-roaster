# Design: ordering (coffees, products, staff-entered orders, roast calendar)

Status: **Draft 2026-11-19** (architect). Brief: [`docs/briefs/ordering.md`](../briefs/ordering.md). Settled points are copied to the brief's Decisions as D-AR-12 to D-AR-24.

Reuses the auth slice's patterns ([`auth-and-customers.md`](auth-and-customers.md)): permissions in one file (§2.5 there), error body `{ statusCode, error, code, message, fieldErrors?, meta? }` (§3 there), pagination `Page<T>` (D-AR-6), nullable fields always present as `null`, timestamps as ISO UTC strings.

The roast calendar defaults, grind list, role matrix and tax codes are working defaults, not facts (Q5, Q6, Q9, OQ-PO-7, OQ-PO-8, A1). Each lives in one place (a DB row or the permission map), so changing one is a data change or a one-line edit.

## 1. Modules and boundaries

| Module               | Owns                                                                                                                    | Public API (`index.ts`)                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `products` (**new**) | `Coffee`, `Grind`, `Product`; display names; product availability                                                       | `ProductsModule`, `ProductsService`, `productDisplayName`, types `OrderableProduct` |
| `orders`             | `Order`, `OrderItem`, `OrderEvent`, `RoastCalendarSettings`, `ClosureDay`; GST per line; status machine; roast calendar | `OrdersModule`, `OrdersService`, `RoastCalendarService`, type `ScheduleSuggestion`  |
| `customers`          | unchanged, plus one read method for orders                                                                              | adds type `OrderingBranch` (and `CustomersService.getBranchForOrdering`)            |
| `inventory`          | unchanged in this slice (only its FK to `Product` becomes `Restrict`)                                                   | unchanged                                                                           |
| `invoicing`          | unchanged; the MYOB slice will build on `Order` (§9)                                                                    | unchanged                                                                           |
| `common/` (infra)    | `money.ts` (GST per line), `business-date.ts` (Sydney dates), `clock.ts` (injectable now)                               | not a module                                                                        |

Why a new `products` module instead of putting products in `inventory`: the catalogue (what we sell and at what price) and stock (how much we have) change for different reasons. Orders need the catalogue but not stock. `inventory` will depend on `products` later, not the other way round. **The lead should add `products` to the module list in `CLAUDE.md`.**

Dependency direction: `orders → products`, `orders → customers`, `orders → auth`. Nothing depends on `orders` yet; the MYOB and reports slices will.

**Cross-module rule (D-AR-13):**

- Business rules about another module's data go through its service: "is this branch orderable" through `CustomersService.getBranchForOrdering`, and "which products can go on a line, at what price" through `ProductsService.findForOrderLines`.
- **Read-only SQL joins are allowed** in list and detail queries (the order list sorts by customer name and searches branch names). Writes to another module's tables are never allowed.

Index contents (backend-developer creates the files; I have not written them because exporting missing files breaks `typecheck`):

```ts
// apps/api/src/modules/products/index.ts
// Public API of the products module. Other modules must import from here, not from internals.
export { ProductsModule } from './products.module';
export { ProductsService } from './products.service';
export { productDisplayName } from './product-display-name';
export type { OrderableProduct } from './products.types';

// apps/api/src/modules/orders/index.ts
export { OrdersModule } from './orders.module';
export { OrdersService } from './orders.service';
export { RoastCalendarService } from './schedule/roast-calendar.service';
export type { ScheduleSuggestion } from './schedule/schedule.types';

// apps/api/src/modules/customers/index.ts — add one line
export type { OrderingBranch } from './customers.types';
```

```ts
// products: the only thing orders needs from the catalogue
interface OrderableProduct {
  id: string;
  sku: string;
  displayName: string; // "House Espresso — 1 kg — Whole bean" or the non-coffee name
  coffeeId: string | null;
  bagSizeGrams: number | null;
  listPriceExGst: Prisma.Decimal;
  taxCode: TaxCode;
  orderable: boolean; // product.isActive && (coffee?.isActive ?? true)
  unavailableReason: 'PRODUCT_INACTIVE' | 'COFFEE_INACTIVE' | null;
}
// ProductsService.findForOrderLines(ids: string[]): Promise<Map<string, OrderableProduct>> (missing ids absent)

// customers
interface OrderingBranch {
  branchId: string;
  branchName: string;
  branchIsActive: boolean;
  customerId: string;
  customerDisplayName: string;
  customerIsActive: boolean;
}
// CustomersService.getBranchForOrdering(branchId: string): Promise<OrderingBranch | null>
```

## 2. Schema (migration `20261119082000_ordering_catalogue_and_orders`, applied)

See `apps/api/prisma/schema.prisma` for the full models. Summary:

**Catalogue (G1, D-PO-8):**

- `Coffee` (`coffees`): `name`, `type` (`SINGLE_ORIGIN` | `BLEND`), `origin?`, `description?`, `isActive`, `deactivatedAt`. `origin` moved here from `Product`; `RoastLevel` is dropped (vocabulary unconfirmed, Q5).
- `Grind` (`grinds`): a table, not an enum, so the list changes without a code change (brief P1). Seeded by the migration: Whole bean (10), Espresso (20), Filter (30) (`sortOrder`).
- `Product` (`products`): `sku` (unique, stored upper-case), `name?`, `coffeeId?`, `bagSizeGrams?`, `grindId?`, `listPriceExGst Decimal(12,2)`, `taxCode` (no default: always chosen), `isActive`, `deactivatedAt`.
  - CHECK `products_kind_chk`: a **coffee product** has coffee + bag size + grind and `name IS NULL`; a **non-coffee product** has `name` and none of the three.
  - Partial unique index `products_active_variant_key` on `(coffeeId, bagSizeGrams, grindId) WHERE isActive`: one **active** product per variant; inactive duplicates are allowed.
  - `coffeeId`, `bagSizeGrams` and `grindId` never change after creation (not in the update DTO). A different bag size is a different product. This keeps past order lines and roast demand meaningful.
  - CHECKs: `bagSizeGrams > 0`, `listPriceExGst > 0`, `sku = upper(btrim(sku))`.
- `InventoryItem.product`: `onDelete` changed from `Cascade` to `Restrict` (gap 7).

**Orders:**

- `OrderStatus`: `DRAFT`, `CONFIRMED`, `PACKED`, `DISPATCHED`, `DELIVERED`, `CANCELLED`. **`ROASTING` removed**: roasting is batched across orders, so it is not an order status (gap analysis §3).
- `Order` (`orders`):
  - `orderNumber Int` autoincrement, sequence restarted at **1001**, shown as **`ORD-1001`** (D-PO-15, D-AR-15). Short to read out on the phone and clearly not a MYOB invoice number.
  - `requestId uuid @unique`: generated by the client per new-order form, makes `POST /orders` idempotent (double-click).
  - `customerId` (copied from the branch, which never moves, D-PO-5), `branchId`, `invoiceId?` (now `onDelete: Restrict`).
  - `deliveryDate`, `roastDate`: `@db.Date`, plain Sydney dates, required. Replaces `requestedDeliveryDate`. `orderedAt` dropped (`createdAt` covers it).
  - `afterCutoff Boolean`: set when lines or dates were last saved off-schedule (§5.4). Shown as the "After cut-off" badge.
  - Stored totals: `subtotalExGst`, `gstAmount`, `totalIncGst` (`Decimal(12,2)`), `totalWeightGrams Int`. Recomputed from the line rows in the same transaction as any line change.
  - `version Int` for optimistic concurrency (O4 Should, D-AR-19).
  - `cancelReason`, and timestamps `confirmedAt` (first confirmation, never cleared), `packedAt`, `dispatchedAt`, `deliveredAt`, `cancelledAt`.
  - `createdById`, `updatedById` → `users` (S3 / G27).
  - CHECKs: `roastDate <= deliveryDate`; `totalIncGst = subtotalExGst + gstAmount`; non-negative totals.
- `OrderItem` (`order_items`): `description` (snapshot of the display name), `quantity` (CHECK 1..999), snapshots `unitPriceExGst`, `taxCode`, and stored `lineTotalExGst`, `gstAmount`, `lineTotalIncGst` (CHECK inc = ex + gst). `@@unique([orderId, productId])`: one line per product (D-PO-11).
- `OrderEvent` (`order_events`): append-only history: `type`, `userId`, `reason?`, `changes Json?`, `at`. Written in the same transaction as each create, update and status change (S3).

**Roast calendar (R1 to R3, D-AR-17):**

- `RoastCalendarSettings` (`roast_calendar_settings`): a single row (CHECK `id = 1`) inserted by the migration with the defaults: `roastDays`, `deliveryDays`, `businessDays` = `{1,2,3,4,5}` (ISO weekdays, Mon to Fri), `cutoffTime` `'12:00'`, `cutoffLeadBusinessDays` 1, `deliveryLagBusinessDays` 1. CHECK enforces weekdays in 1..7, non-empty, `HH:mm`, and lead/lag in 0..14.
- `ClosureDay` (`closure_days`): `date` (unique, `@db.Date`), `description`. Neither a business, roast nor delivery day (R2).

**Migration notes:**

- It starts with a guard that aborts if `products`, `orders`, `order_items` or `inventory_items` hold any rows. They are empty everywhere today (no endpoint ever created them), and the reshape would otherwise lose data.
- Hand-written SQL (sequence restart, CHECKs, partial unique index, default rows) is not modelled by Prisma. I checked twice that Prisma leaves it alone: `migrate diff` and a `migrate dev` shadow replay both came out empty.
- Uses Postgres 18's built-in `uuidv7()` for the seeded grind ids.

**Not added (deliberately):** per-customer prices, standing orders, the MYOB invoice id, stock deductions. §9 shows how each is added later without changing what is built now.

## 3. Money and GST (O3, D-PO-12, D-AR-16)

All on the server with `Prisma.Decimal` (decimal.js), never JS `number`. In `common/money.ts`:

```ts
lineAmounts(quantity: number, unitPriceExGst: Decimal, taxCode: TaxCode) => {
  lineTotalExGst  = unitPriceExGst.times(quantity)                       // exact, 2 dp
  gstAmount       = taxCode === 'GST'
                      ? lineTotalExGst.times('0.1').toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
                      : 0.00
  lineTotalIncGst = lineTotalExGst.plus(gstAmount)
}
orderTotals = sums of the three over all lines; totalWeightGrams = Σ bagSizeGrams × quantity over coffee lines
```

- Amounts are always positive, so half-up and half-away-from-zero agree.
- GST is per line (`CLAUDE.md`). Rounding on the invoice total instead (A3) would change only `orderTotals`. Line figures stay as they are.
- Money in DTOs is a string with exactly 2 decimals (`"34.00"`). Money in requests is a string matching `^\d{1,4}(\.\d{1,2})?$` and greater than 0. `"34.005"`, `"-1"`, `"0"` and `"0.00"` fail with `Price must be more than $0.00 with at most 2 decimal places`.
- **Price cap $9,999.99 per unit.** With 999 bags and at most 200 lines per order, the total stays under `Decimal(12,2)`'s limit.

Worked examples (test oracle, from the brief):

| Lines                                                    | Line ex / GST / inc                          | Subtotal ex-GST |  GST | Total inc-GST |
| -------------------------------------------------------- | -------------------------------------------- | --------------: | ---: | ------------: |
| 12 × House Espresso 1 kg @ 34.00, GST_FREE               | 408.00 / 0.00 / 408.00                       |          408.00 | 0.00 |        408.00 |
| 12 × @ 34.00 GST_FREE + 2 × Cleaning tablets @ 18.18 GST | 408.00 / 0.00 / 408.00; 36.36 / 3.64 / 40.00 |          444.36 | 3.64 |        448.00 |
| 3 × @ 12.35 GST                                          | 37.05 / 3.71 (3.705 half-up) / 40.76         |           37.05 | 3.71 |         40.76 |
| 1 × @ 0.05 GST                                           | 0.05 / 0.01 (0.005 half-up) / 0.06           |            0.05 | 0.01 |          0.06 |

## 4. Status machine (S1, D-PO-14, D-AR-18)

```
DRAFT ──confirm──► CONFIRMED ──pack──► PACKED ──dispatch──► DISPATCHED ──deliver──► DELIVERED
                                         └──────────────deliver──────────────────────┘
DRAFT | CONFIRMED | PACKED | DISPATCHED ──cancel(reason)──► CANCELLED
Revert (Should, reason): CONFIRMED→DRAFT, PACKED→CONFIRMED, DISPATCHED→PACKED
```

| Transition        | Permission                                                                                                                      | Preconditions (else error)                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| confirm           | `orders:write`; `orders:late-change` if off-schedule (§5.4)                                                                     | DRAFT; ≥ 1 line (`ORDER_EMPTY`); customer and branch active (`CUSTOMER_INACTIVE`, `BRANCH_INACTIVE`); every line's product orderable (`PRODUCT_UNAVAILABLE`); on schedule or permitted (`SCHEDULE_OVERRIDE_REQUIRED`) |
| pack              | `orders:fulfil`                                                                                                                 | CONFIRMED                                                                                                                                                                                                             |
| dispatch (Should) | `orders:fulfil`                                                                                                                 | PACKED                                                                                                                                                                                                                |
| deliver           | `orders:fulfil`                                                                                                                 | PACKED or DISPATCHED                                                                                                                                                                                                  |
| cancel            | `orders:write` for DRAFT, and for CONFIRMED before cut-off; `orders:late-change` for CONFIRMED past cut-off, PACKED, DISPATCHED | not DELIVERED/CANCELLED (`INVALID_TRANSITION`); `reason` 1..500 chars                                                                                                                                                 |
| revert (Should)   | `orders:late-change`                                                                                                            | CONFIRMED, PACKED or DISPATCHED; `reason` required. Clears the timestamp of the step undone (`packedAt`, `dispatchedAt`); `confirmedAt` is never cleared                                                              |

- Pack, dispatch and deliver ignore cut-off and customer/branch status. An order confirmed before a customer was deactivated still goes out (O4); the detail shows the warning.
- Every transition increments `version`, sets `updatedById`, writes an `OrderEvent`, and sets the matching timestamp.
- **Delivered is the future MYOB trigger** (`myob-integration.md` option A). Nothing listens yet.

## 5. Roast calendar and cut-off (R1 to R3, D-PO-13, D-AR-17)

### 5.1 Definitions

All dates are plain Sydney dates (`YYYY-MM-DD`). "Now" is the injected clock converted to Sydney wall-clock time with `Intl.DateTimeFormat` and `APP_TIMEZONE` (`common/business-date.ts`). Plain dates are never parsed with `new Date(str)`. Date arithmetic is done on plain dates (UTC-midnight `Date` or `{y,m,d}`), so DST never shifts a day.

- **Business day**: weekday in `businessDays` and not a closure day.
- **Roast day**: weekday in `roastDays` and not a closure day. **Delivery day**: weekday in `deliveryDays` and not a closure day.
- `addBusinessDays(d, n)`: step forward over business days; `n = 0` returns `d`. `subBusinessDays(d, n)` likewise backwards.
- **Cut-off of roast date R**: Sydney wall-clock `subBusinessDays(R, cutoffLeadBusinessDays)` at `cutoffTime`. Returned in DTOs as `{ date, time }` (Sydney local), not an instant, so no offset maths is needed.
- **Past cut-off**: `nowSydney >= cutoff`, comparing `"YYYY-MM-DDTHH:mm:ss"` strings. At exactly 12:00:00 the cut-off has passed. (During the repeated hour when daylight saving ends, the comparison is ambiguous for one hour; harmless for cut-offs in business hours.)
- **On schedule** for dates (R, D) at time `now`: R is a roast day, D is a delivery day, `addBusinessDays(R, deliveryLagBusinessDays) <= D`, and R is not past cut-off. Otherwise it is **off schedule**, with `reasons` from `CUTOFF_PASSED`, `NOT_A_ROAST_DAY`, `NOT_A_DELIVERY_DAY`, `DELIVERY_TOO_SOON` (closure days show up as not a roast/delivery day).

### 5.2 Suggestions

- **From now** (new order, copy): R = the first roast day from today (Sydney) whose cut-off has not passed. D = the first delivery day on or after `addBusinessDays(R, lag)`.
- **From a delivery date D** (staff changed it): R = the latest roast day with `addBusinessDays(R, lag) <= D`. Returned with `onSchedule` (false if R's cut-off has passed, so the web can say "too late for this delivery date" before saving).
- Searches are bounded to 366 days. If nothing is found (e.g. everything closed): 409 `NO_SCHEDULE_AVAILABLE`.

Examples with the defaults (all Sydney time; the UTC instants are what the fake clock is set to):

| Now                                                                             | Suggested roast                       | Suggested delivery |
| ------------------------------------------------------------------------------- | ------------------------------------- | ------------------ |
| Tue 24 Nov 2026 10:00 (`2026-11-23T23:00Z`)                                     | Wed 25 Nov                            | Thu 26 Nov         |
| Tue 24 Nov 2026 12:01 (`2026-11-24T01:01Z`)                                     | Thu 26 Nov                            | Fri 27 Nov         |
| Fri 27 Nov 2026 15:00 (`2026-11-27T04:00Z`)                                     | Tue 1 Dec                             | Wed 2 Dec          |
| Wed 23 Dec 2026 13:00 (`2026-12-23T02:00Z`), closures Fri 25 Dec and Mon 28 Dec | Tue 29 Dec (cut-off Thu 24 Dec 12:00) | Wed 30 Dec         |

Delivery date D → roast: Fri 27 Nov → Thu 26 Nov; Mon 30 Nov → Fri 27 Nov.

DST oracles (cut-off 12:00 Tue for a Wed roast): `2026-10-06T00:59:59Z` is 11:59:59 AEDT (before); `2026-10-06T01:00:00Z` is 12:00 AEDT (past). `2026-06-09T01:59:59Z` is 11:59:59 AEST (before); `2026-06-09T02:00:00Z` is past.

### 5.3 Hard date rules (everyone, 400 `VALIDATION_FAILED`)

Checked only when the request sets or changes a date:

- `deliveryDate < today` → `deliveryDate`: `Delivery date can't be in the past`.
- `roastDate < today` → `roastDate`: `Roast date can't be in the past`.
- `roastDate > deliveryDate` → `roastDate`: `Roast date must be on or before the delivery date`.

A delivery date more than 90 days ahead is a **web-only warning** (no API rule).

### 5.4 Off-schedule saves and `afterCutoff`

A save is **schedule-relevant** if it changes lines or either date, or confirms the order. Notes-only changes are never schedule-relevant.

- On a schedule-relevant save of a DRAFT or CONFIRMED order, compute on-schedule for the resulting dates at `now`:
  - On schedule → allowed with `orders:write`; set `afterCutoff = false`.
  - Off schedule → needs `orders:late-change`. With it: allowed, and `afterCutoff = true`. Without it:
    - DRAFT (or a new order): 409 `SCHEDULE_OVERRIDE_REQUIRED`, `meta: { reasons, cutoff, suggestion: { roastDate, deliveryDate } }`. Staff can pick the suggested dates and save again (brief E table).
    - CONFIRMED past cut-off: 403 `FORBIDDEN`, `meta: { reason: 'PAST_CUTOFF' }`. A confirmed order past cut-off may be in the roast plan, so staff can't re-date it either (S1).
- PACKED / DISPATCHED: see §6.3; `afterCutoff` is not recomputed.
- `afterCutoff` stays as last computed. It does not flip to true when time passes (the derived `pastCutoff` covers that).

### 5.5 Settings changes

Changing settings or closures affects suggestions and future on-schedule checks only. Existing orders keep their dates; `pastCutoff` for them is recomputed with the new settings (it is derived).

## 6. API

All under `/api/v1`. Errors as in auth §3. Pagination as D-AR-6 (`page` 1-based, `pageSize` default 25, max 100, `Page<T> = { items, page, pageSize, totalItems, totalPages }`, a page past the end returns empty `items`). Unknown or malformed ids give 404 with `<THING>_NOT_FOUND`. Ids referenced in a body that don't exist give 400 `VALIDATION_FAILED` with a field error coded `notFound`.

### 6.1 Permissions (D-AR-14, extends auth `permissions.ts`)

| Permission                | ADMIN | MANAGER | STAFF | Covers                                                                                                                                            |
| ------------------------- | :---: | :-----: | :---: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products:read`           |  Yes  |   Yes   |  Yes  | coffees, grinds, products, prices                                                                                                                 |
| `products:write`          |  Yes  |   Yes   |  No   | create/edit coffees, grinds, products; price and tax code; (de)activate                                                                           |
| `orders:read`             |  Yes  |   Yes   |  Yes  | list, detail, schedule suggestions, roast calendar (read), roast summary                                                                          |
| `orders:write`            |  Yes  |   Yes   |  Yes  | create, copy, edit and confirm on schedule; notes on any status; cancel DRAFT, or CONFIRMED before cut-off; delete a never-confirmed DRAFT        |
| `orders:late-change`      |  Yes  |   Yes   |  No   | off-schedule saves and confirms (rush, past cut-off); cancel past cut-off or PACKED/DISPATCHED; change delivery date on PACKED/DISPATCHED; revert |
| `orders:fulfil`           |  Yes  |   Yes   |  Yes  | pack, dispatch, deliver                                                                                                                           |
| `orders:short-supply`     |  Yes  |   Yes   |  No   | reduce or remove lines on PACKED/DISPATCHED                                                                                                       |
| `settings:roast-calendar` |  Yes  |   No    |  No   | change roast calendar settings and closure days                                                                                                   |

**Change to the auth mapping:** MANAGER is no longer `ALL`. It becomes all permissions except `settings:roast-calendar`. Spell the list out rather than filtering, so a future ADMIN-only permission isn't granted to MANAGER by accident.

### 6.2 Catalogue (`products` module)

| Method & path                                         | Permission       | Request                                          | 2xx                                                                   | Errors                                             |
| ----------------------------------------------------- | ---------------- | ------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------- |
| `GET /coffees`                                        | `products:read`  | `?status=active\|inactive\|all&search`           | 200 `{ items: CoffeeDto[] }` (not paginated)                          | 400                                                |
| `POST /coffees`                                       | `products:write` | `CreateCoffeeDto`                                | 201 `CoffeeDto`                                                       | 400, 409 `COFFEE_NAME_TAKEN`                       |
| `GET /coffees/:id`                                    | `products:read`  |                                                  | 200 `CoffeeDetailDto`                                                 | 404 `COFFEE_NOT_FOUND`                             |
| `PATCH /coffees/:id`                                  | `products:write` | `UpdateCoffeeDto`                                | 200 `CoffeeDto`                                                       | 400, 404, 409 `COFFEE_NAME_TAKEN`                  |
| `POST /coffees/:id/deactivate`, `/reactivate`         | `products:write` |                                                  | 200 `CoffeeDto` (idempotent)                                          | 404                                                |
| `GET /grinds`                                         | `products:read`  | `?status=active\|inactive\|all` (default active) | 200 `{ items: GrindDto[] }` sorted by `sortOrder`, name               | 400                                                |
| `POST /grinds` (Should)                               | `products:write` | `{ name, sortOrder? }`                           | 201 `GrindDto`                                                        | 400, 409 `GRIND_NAME_TAKEN`                        |
| `PATCH /grinds/:id` (Should)                          | `products:write` | `{ name?, sortOrder? }`                          | 200 `GrindDto`                                                        | 400, 404 `GRIND_NOT_FOUND`, 409                    |
| `POST /grinds/:id/deactivate`, `/reactivate` (Should) | `products:write` |                                                  | 200 `GrindDto`                                                        | 404                                                |
| `GET /products`                                       | `products:read`  | `ListProductsQuery`                              | 200 `Page<ProductDto>`                                                | 400                                                |
| `GET /products/orderable`                             | `products:read`  |                                                  | 200 `{ items: ProductDto[] }` all orderable, same sort, not paginated | —                                                  |
| `POST /products`                                      | `products:write` | `CreateProductDto`                               | 201 `ProductDto`                                                      | 400, 409 `SKU_TAKEN`, 409 `PRODUCT_VARIANT_EXISTS` |
| `GET /products/:id`                                   | `products:read`  |                                                  | 200 `ProductDto`                                                      | 404 `PRODUCT_NOT_FOUND`                            |
| `PATCH /products/:id`                                 | `products:write` | `UpdateProductDto`                               | 200 `ProductDto`                                                      | 400, 404, 409 `SKU_TAKEN`                          |
| `POST /products/:id/deactivate`, `/reactivate`        | `products:write` |                                                  | 200 `ProductDto` (idempotent)                                         | 404, 409 `PRODUCT_VARIANT_EXISTS` (reactivate)     |

No DELETE (D-PO-9).

```ts
interface CoffeeDto {
  id: string;
  name: string;
  type: 'SINGLE_ORIGIN' | 'BLEND';
  origin: string | null;
  description: string | null;
  isActive: boolean;
  activeProductCount: number;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
interface CoffeeDetailDto extends CoffeeDto {
  products: ProductDto[];
} // all its products, active first
interface CreateCoffeeDto {
  name: string; // 1..100 after trim; unique among ALL coffees, case-insensitive -> "A coffee called <name> already exists"
  type: 'SINGLE_ORIGIN' | 'BLEND';
  origin?: string | null; // 0..100
  description?: string | null; // 0..1000
}
type UpdateCoffeeDto = Partial<CreateCoffeeDto>;

interface GrindDto {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

interface ListProductsQuery {
  page?: number;
  pageSize?: number;
  search?: string; // ILIKE on coffee name, product name, SKU; max 100
  status?: 'active' | 'inactive' | 'all'; // default 'active' (product.isActive only)
  coffeeId?: string;
  kind?: 'coffee' | 'other';
}
// Sort: coffee products first by lower(coffee.name), bagSizeGrams, grind.sortOrder, grind.name;
// then non-coffee by lower(name); tie-break id.

interface ProductDto {
  id: string;
  sku: string;
  kind: 'COFFEE' | 'OTHER';
  displayName: string; // see below
  name: string | null; // OTHER only
  coffee: { id: string; name: string; type: 'SINGLE_ORIGIN' | 'BLEND'; isActive: boolean } | null;
  bagSizeGrams: number | null;
  grind: { id: string; name: string } | null;
  listPriceExGst: string; // "34.00"
  taxCode: 'GST' | 'GST_FREE';
  isActive: boolean;
  orderable: boolean; // isActive && (coffee?.isActive ?? true)
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateProductDto {
  sku: string; // trimmed, upper-cased, 1..40, /^[A-Z0-9][A-Z0-9-]*$/ after upper-casing
  // Coffee product: all three, no name.  Non-coffee: name only.  Anything else -> 400, field "kind", code "productKind".
  coffeeId?: string;
  bagSizeGrams?: number; // int 1..100000 -> "Bag size must be a whole number of grams above 0"
  grindId?: string; // must be an active grind on create
  name?: string; // 1..200
  listPriceExGst: string; // §3 money rule, max 9999.99
  taxCode: 'GST' | 'GST_FREE'; // required; no server default (A1)
}
interface UpdateProductDto {
  // coffeeId, bagSizeGrams, grindId are not accepted (400 unknown field)
  sku?: string;
  name?: string; // OTHER only; on a COFFEE product -> 400 field "name", code "productKind"
  listPriceExGst?: string;
  taxCode?: 'GST' | 'GST_FREE';
}
```

- **Display name** (`productDisplayName`, D-AR-21): coffee products are `<coffee name> — <size> — <grind name>` with an em dash and spaces. Size is `<g> g` below 1000 g, otherwise kg with up to 3 decimals and trailing zeros dropped (`250 g`, `1 kg`, `1.5 kg`, `2.27 kg`). Non-coffee products use `name`. The web uses `displayName` and never builds it.
- `PRODUCT_VARIANT_EXISTS`: `message` `"<display name> already exists"`, `meta: { productId, displayName }`. Pre-check plus map Postgres unique violation on `products_active_variant_key` (race).
- Changing price or tax code never touches order lines. P2 Should warning: the web counts open orders carrying the product with `GET /orders?productId=<id>&status=DRAFT,CONFIRMED,PACKED,DISPATCHED&pageSize=1` → `totalItems`.

### 6.3 Orders (`orders` module)

| Method & path                          | Permission (static guard) | Request                               | 2xx                                                                             | Errors (besides 400/403/404)                                                                                                                         |
| -------------------------------------- | ------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /orders`                          | `orders:read`             | `ListOrdersQuery`                     | 200 `Page<OrderListItemDto>`                                                    |                                                                                                                                                      |
| `POST /orders`                         | `orders:write`            | `CreateOrderDto`                      | 201 `OrderDto`; **200** with the existing order if `requestId` was already used | `CUSTOMER_INACTIVE`, `BRANCH_INACTIVE`, `PRODUCT_UNAVAILABLE`, `PRICE_CHANGED`, `SCHEDULE_OVERRIDE_REQUIRED`, `NO_SCHEDULE_AVAILABLE`                |
| `GET /orders/:id`                      | `orders:read`             |                                       | 200 `OrderDto`                                                                  | 404 `ORDER_NOT_FOUND`                                                                                                                                |
| `PATCH /orders/:id`                    | `orders:write`            | `UpdateOrderDto`                      | 200 `OrderDto`                                                                  | `VERSION_CONFLICT`, `ORDER_NOT_EDITABLE`, `ORDER_EMPTY`, `PRODUCT_UNAVAILABLE`, `PRICE_CHANGED`, `SCHEDULE_OVERRIDE_REQUIRED`                        |
| `POST /orders/:id/confirm`             | `orders:write`            | `{ version }`                         | 200 `OrderDto`                                                                  | `VERSION_CONFLICT`, `INVALID_TRANSITION`, `ORDER_EMPTY`, `CUSTOMER_INACTIVE`, `BRANCH_INACTIVE`, `PRODUCT_UNAVAILABLE`, `SCHEDULE_OVERRIDE_REQUIRED` |
| `POST /orders/:id/pack`                | `orders:fulfil`           | `{ version }`                         | 200 `OrderDto`                                                                  | `VERSION_CONFLICT`, `INVALID_TRANSITION`                                                                                                             |
| `POST /orders/:id/dispatch` (Should)   | `orders:fulfil`           | `{ version }`                         | 200 `OrderDto`                                                                  | same                                                                                                                                                 |
| `POST /orders/:id/deliver`             | `orders:fulfil`           | `{ version }`                         | 200 `OrderDto`                                                                  | same                                                                                                                                                 |
| `POST /orders/:id/cancel`              | `orders:write`            | `{ version, reason }`                 | 200 `OrderDto`                                                                  | same; 403 `PAST_CUTOFF`/status rule (§4)                                                                                                             |
| `POST /orders/:id/revert` (Should)     | `orders:late-change`      | `{ version, reason }`                 | 200 `OrderDto`                                                                  | same                                                                                                                                                 |
| `POST /orders/:id/copy` (Should)       | `orders:write`            | `{ requestId }`                       | 201 `CopyOrderResultDto` (200 on repeat `requestId`)                            | `CUSTOMER_INACTIVE`, `BRANCH_INACTIVE`, `NO_SCHEDULE_AVAILABLE`                                                                                      |
| `DELETE /orders/:id?version=` (Should) | `orders:write`            |                                       | 204                                                                             | `VERSION_CONFLICT`, `ORDER_NOT_DELETABLE` (not DRAFT, or `confirmedAt` set)                                                                          |
| `GET /orders/schedule`                 | `orders:read`             | `?deliveryDate=YYYY-MM-DD` (optional) | 200 `ScheduleSuggestionDto`                                                     | `NO_SCHEDULE_AVAILABLE`                                                                                                                              |
| `GET /orders/roast-summary` (Should)   | `orders:read`             | `?roastDate=YYYY-MM-DD` (required)    | 200 `RoastSummaryDto`                                                           |                                                                                                                                                      |

```ts
interface ListOrdersQuery {
  page?: number;
  pageSize?: number;
  search?: string; // order number (see below) OR customer legal/trading name OR branch name (ILIKE); max 100
  status?: string; // comma-separated OrderStatus values; default "DRAFT,CONFIRMED,PACKED,DISPATCHED"
  deliveryFrom?: string; // YYYY-MM-DD, inclusive
  deliveryTo?: string; // YYYY-MM-DD, inclusive; deliveryTo < deliveryFrom -> 400
  roastDate?: string; // YYYY-MM-DD, exact
  customerId?: string;
  branchId?: string;
  productId?: string; // orders with a line for this product (P2 Should warning)
}
// No implicit date filter in the API. The web's default view sends deliveryFrom=<today Sydney> (§8).
// Order-number search: if the term matches /^(ORD-?)?\d+$/i, the digits match orderNumber as a text prefix
// ("10" finds ORD-1001..ORD-1099, "ORD-1001" finds ORD-1001, ORD-10010...). Name matching still applies.
// Sort: deliveryDate ASC, lower(customer display name) ASC, lower(branch name) ASC, orderNumber ASC.
// Implementation: same raw-SQL-ids-then-findMany pattern as the customers list (read-only joins, D-AR-13).

interface OrderListItemDto {
  id: string;
  orderNumber: string; // "ORD-1001"
  status: OrderStatus;
  deliveryDate: string; // YYYY-MM-DD
  roastDate: string;
  customer: { id: string; displayName: string; isActive: boolean };
  branch: { id: string; name: string; suburb: string; isActive: boolean };
  lineCount: number;
  totalWeightGrams: number; // web shows "14.5 kg"
  subtotalExGst: string;
  gstAmount: string;
  totalIncGst: string;
  afterCutoff: boolean; // stored flag (§5.4)
  pastCutoff: boolean; // derived now
  updatedAt: string;
}

interface OrderDto extends Omit<OrderListItemDto, 'branch'> {
  version: number;
  notes: string | null;
  cutoff: { date: string; time: string }; // cut-off for roastDate, Sydney local ("2026-11-24", "12:00")
  branch: {
    id: string;
    name: string;
    isActive: boolean;
    addressLine1: string;
    addressLine2: string | null;
    suburb: string;
    state: AustralianState;
    postcode: string;
    contactName: string | null;
    contactPhone: string | null;
    deliveryNotes: string | null; // read-only on the order
  };
  lines: OrderLineDto[]; // ordered by description, case-insensitive
  cancelReason: string | null;
  confirmedAt: string | null;
  packedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
  updatedBy: { id: string; name: string };
  allowedActions: AllowedActions; // for the CURRENT user, now (see below)
  events: OrderEventDto[]; // S3 Should; newest first
}

interface OrderLineDto {
  id: string;
  productId: string;
  sku: string;
  description: string; // snapshot
  taxCode: 'GST' | 'GST_FREE'; // snapshot
  quantity: number;
  unitPriceExGst: string; // snapshot
  lineTotalExGst: string;
  gstAmount: string;
  lineTotalIncGst: string;
  productOrderable: boolean; // false -> "Inactive product" badge
}

interface AllowedActions {
  editLines: 'full' | 'reduceOnly' | 'none';
  editRoastDate: boolean;
  editDeliveryDate: boolean;
  editNotes: boolean;
  confirm: boolean;
  pack: boolean;
  dispatch: boolean;
  deliver: boolean;
  cancel: boolean;
  revert: boolean;
  delete: boolean;
  copy: boolean;
}

interface OrderEventDto {
  id: string;
  type:
    | 'CREATED'
    | 'UPDATED'
    | 'CONFIRMED'
    | 'PACKED'
    | 'DISPATCHED'
    | 'DELIVERED'
    | 'CANCELLED'
    | 'REVERTED';
  user: { id: string; name: string };
  reason: string | null;
  changes: Record<string, unknown> | null;
  at: string;
}

interface CreateOrderDto {
  requestId: string; // uuid, generated once per new-order form
  branchId: string;
  deliveryDate?: string; // omitted -> suggested (both dates omitted -> both suggested)
  roastDate?: string; // omitted with deliveryDate given -> roast suggested from deliveryDate (§5.2)
  notes?: string | null; // 0..2000
  lines?: OrderLineInput[]; // 0..200; default []
}

interface OrderLineInput {
  productId: string;
  quantity: number; // int 1..999 -> "Quantity must be a whole number from 1 to 999"
  // Required when the product is not already on the order (new line); ignored for existing lines.
  expectedUnitPriceExGst?: string; // the price the form showed
  expectedTaxCode?: 'GST' | 'GST_FREE';
}

interface UpdateOrderDto {
  version: number;
  deliveryDate?: string;
  roastDate?: string; // if only deliveryDate is sent, roastDate is NOT changed automatically; the web
  // calls GET /orders/schedule?deliveryDate= to re-suggest and sends both
  notes?: string | null;
  lines?: OrderLineInput[]; // full desired set of lines (replace semantics, see below)
  reason?: string; // 1..500; required when reducing/removing lines on PACKED/DISPATCHED (short-supply note)
}

interface CopyOrderResultDto {
  order: OrderDto; // new DRAFT, same branch, suggested dates from now, lines at TODAY's prices
  skippedLines: {
    productId: string;
    description: string;
    reason: 'PRODUCT_INACTIVE' | 'COFFEE_INACTIVE';
  }[];
}

interface ScheduleSuggestionDto {
  roastDate: string;
  deliveryDate: string;
  cutoff: { date: string; time: string };
  onSchedule: boolean;
  reasons: ('CUTOFF_PASSED' | 'NOT_A_ROAST_DAY' | 'NOT_A_DELIVERY_DAY' | 'DELIVERY_TOO_SOON')[];
}

interface RoastSummaryDto {
  // CONFIRMED orders only (brief L3)
  roastDate: string;
  coffees: { coffeeId: string; coffeeName: string; totalWeightGrams: number; orderCount: number }[]; // by name
  totalWeightGrams: number;
}
```

**Line replace semantics (`lines` in PATCH):**

- The array is the full desired set. Duplicate `productId` → 400 at `lines.<i>.productId`, code `duplicateProduct`, message `Already on this order — change the quantity instead`.
- A product already on the order keeps its snapshot (price, tax code, description) whatever its quantity, even if it is now inactive (O4).
- A product not on the order is a new line. It must be orderable (else 409 `PRODUCT_UNAVAILABLE`, `meta.lines: [{ productId, description, reason }]`), and must carry `expectedUnitPriceExGst` and `expectedTaxCode` (else 400 at that line). If they differ from the product's current values → 409 `PRICE_CHANGED`, `meta.lines: [{ productId, description, expected: { unitPriceExGst, taxCode }, current: { unitPriceExGst, taxCode } }]`, and nothing is saved. Then the snapshot is taken from the current values.
- A product on the order but missing from the array is removed. Removing and re-adding **in one save** keeps the snapshot (the line was never gone). Across two saves it gets the current price (O4).
- Totals and `totalWeightGrams` are recomputed from the stored line rows in the same transaction.

**What can change, by status (S1 table, enforced in the service; `ORDER_NOT_EDITABLE` = 409 with `meta: { status, fields }`):**

| Status               | `lines`                                                                                                                                                                                      | `roastDate`          | `deliveryDate`                                                         | `notes`        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------- | -------------- |
| DRAFT                | full (§5.4 schedule rule); may be empty                                                                                                                                                      | yes (§5.3, §5.4)     | yes (§5.3, §5.4)                                                       | `orders:write` |
| CONFIRMED            | full (§5.4); must stay ≥ 1 line (`ORDER_EMPTY`)                                                                                                                                              | yes (§5.3, §5.4)     | yes (§5.3, §5.4)                                                       | `orders:write` |
| PACKED, DISPATCHED   | reduce/remove only, `orders:short-supply` (else 403), `reason` required; adding a product or raising a quantity → `ORDER_NOT_EDITABLE`; must stay ≥ 1 line (`ORDER_EMPTY`: "cancel instead") | `ORDER_NOT_EDITABLE` | `orders:late-change` (else 403); §5.3 applies; `afterCutoff` untouched | `orders:write` |
| DELIVERED, CANCELLED | `ORDER_NOT_EDITABLE`                                                                                                                                                                         | `ORDER_NOT_EDITABLE` | `ORDER_NOT_EDITABLE`                                                   | `orders:write` |

A field counts as "changed" only if its value differs from the stored one. Sending the current `deliveryDate` back unchanged on a DELIVERED order is not an error.

**Order of checks** (so tests get one deterministic error):

1. Guard permission (403).
2. Load (404).
3. DTO validation (400).
4. `version` (409 `VERSION_CONFLICT`, `meta: { currentVersion, status }`, message "This order was changed by someone else — reload").
5. Status transition / editability (409 `INVALID_TRANSITION` with `meta: { status }`, or `ORDER_NOT_EDITABLE`).
6. Status-based permission (403 `FORBIDDEN` with `meta.reason`: `PAST_CUTOFF`, `SHORT_SUPPLY`, `LATE_CHANGE`).
7. Hard date rules (400).
8. Customer/branch active (on create, confirm, copy).
9. Products (`PRODUCT_UNAVAILABLE`, then `PRICE_CHANGED`).
10. `ORDER_EMPTY`.
11. Schedule (§5.4).

**Concurrency (D-AR-19):** every write is `UPDATE … WHERE id = $1 AND version = $2` (or `updateMany` with `version` and check the count) inside the transaction, so two simultaneous confirms produce one success and one `VERSION_CONFLICT`. Create is idempotent through `requestId` (unique). On a repeat, return the existing order with 200 if it was created by the same user, otherwise 409 `REQUEST_ID_REUSED`.

### 6.4 Roast calendar settings (`orders` module)

| Method & path                                  | Permission                | Request / response                                                                      | Errors                  |
| ---------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| `GET /roast-calendar`                          | `orders:read`             | 200 `RoastCalendarDto`                                                                  |                         |
| `PUT /roast-calendar` (Should, R3)             | `settings:roast-calendar` | body `RoastCalendarInput` (all fields required), 200 `RoastCalendarDto`                 | 400                     |
| `GET /roast-calendar/closures` (Should, R2)    | `orders:read`             | `?from&to` (YYYY-MM-DD, default from = today), 200 `{ items: ClosureDayDto[] }` by date |                         |
| `POST /roast-calendar/closures` (Should)       | `settings:roast-calendar` | `{ date, description }` (1..100), 201 `ClosureDayDto`                                   | 409 `CLOSURE_EXISTS`    |
| `DELETE /roast-calendar/closures/:id` (Should) | `settings:roast-calendar` | 204                                                                                     | 404 `CLOSURE_NOT_FOUND` |

```ts
interface RoastCalendarDto {
  roastDays: number[]; // ISO weekdays 1 (Mon) .. 7 (Sun), ascending, unique
  deliveryDays: number[];
  businessDays: number[];
  cutoffTime: string; // "HH:mm", Sydney
  cutoffLeadBusinessDays: number; // 0..14
  deliveryLagBusinessDays: number; // 0..14
  updatedAt: string;
}
type RoastCalendarInput = Omit<RoastCalendarDto, 'updatedAt'>; // arrays non-empty, values 1..7, deduplicated by the API
interface ClosureDayDto {
  id: string;
  date: string;
  description: string;
}
```

Closure days are configuration, so a hard delete is fine (unlike orders). For the Must, settings are only changed through `PUT` or SQL. They are never hard-coded: the calendar service reads the row (cache for at most 60 s, cleared on `PUT`).

### 6.5 Error codes added in this slice

| Status | `code`                                                                                             | When                                                                                 |
| -----: | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
|    404 | `COFFEE_NOT_FOUND`, `GRIND_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `ORDER_NOT_FOUND`, `CLOSURE_NOT_FOUND` | unknown or malformed id                                                              |
|    409 | `COFFEE_NAME_TAKEN`, `GRIND_NAME_TAKEN`, `SKU_TAKEN`                                               | uniqueness (`fieldErrors` on the field, `meta: { id }`)                              |
|    409 | `PRODUCT_VARIANT_EXISTS`                                                                           | second active product for coffee + size + grind                                      |
|    409 | `CUSTOMER_INACTIVE`, `BRANCH_INACTIVE`                                                             | order create/confirm/copy for an inactive customer or branch; `meta: { customerId }` |
|    409 | `PRODUCT_UNAVAILABLE`                                                                              | new line or confirm with a product that is inactive or whose coffee is inactive      |
|    409 | `PRICE_CHANGED`                                                                                    | list price or tax code changed since the form loaded                                 |
|    409 | `SCHEDULE_OVERRIDE_REQUIRED`                                                                       | off-schedule save without `orders:late-change` (DRAFT/new)                           |
|    409 | `NO_SCHEDULE_AVAILABLE`                                                                            | no roast/delivery day within 366 days                                                |
|    409 | `VERSION_CONFLICT`                                                                                 | stale `version`                                                                      |
|    409 | `INVALID_TRANSITION`                                                                               | action not allowed from the current status                                           |
|    409 | `ORDER_NOT_EDITABLE`                                                                               | field can't change in this status                                                    |
|    409 | `ORDER_EMPTY`                                                                                      | confirm with no lines, or a save that would leave a non-draft order with no lines    |
|    409 | `ORDER_NOT_DELETABLE`                                                                              | delete of a non-draft or once-confirmed order                                        |
|    409 | `REQUEST_ID_REUSED`                                                                                | `requestId` belongs to another user's order                                          |
|    409 | `CLOSURE_EXISTS`                                                                                   | closure day already set for that date                                                |
|    403 | `FORBIDDEN` + `meta.reason`                                                                        | `PAST_CUTOFF`, `SHORT_SUPPLY`, `LATE_CHANGE` (status-based permission)               |

## 7. Edge cases for backend-developer and qa-engineer

**GST and money**

1. The four worked examples in §3, exactly, through `POST /orders` and the order totals.
2. A line at `quantity` 999 and price 9999.99 with GST: ex 9,989,990.01, GST 998,999.00 (998,999.001 rounded), inc 10,988,989.01. 200 such lines total 2,197,797,802.00, within `Decimal(12,2)`. A 201st line → 400.
3. Prices in requests: `"34.005"`, `"-1"`, `"0"`, `"0.00"`, `"1e3"`, `34` (a number, not a string), and `"10000.00"` all fail; `"0.01"` and `"9999.99"` pass. Responses always have 2 decimals (`"34.00"`, not `"34"`).
4. A mixed order shows each line's tax code. Changing the product's tax code afterwards does not change existing lines or totals.

**Snapshots**

5. Change a product's list price after a line exists: the existing line keeps its price. Changing its quantity keeps the price. Removing it (save) and re-adding it (second save) picks up the new price. Removing and re-adding within one PATCH keeps the old price.
6. `PRICE_CHANGED`: the form loaded 34.00, the price is now 36.00, PATCH adds the line with `expectedUnitPriceExGst: "34.00"` → 409 with expected/current. Nothing is saved, and `version` does not change. The same applies to a tax-code change.
7. A product deactivated after it was added: the line stays, `productOrderable: false`, the quantity can still change on a DRAFT/CONFIRMED order, and a PACKED order still delivers. Confirming a DRAFT that contains it → `PRODUCT_UNAVAILABLE`.
8. Coffee deactivated: its products are not orderable (`COFFEE_INACTIVE`), but their own `isActive` is unchanged. Reactivating the coffee makes them orderable again.
9. Description snapshot: rename the coffee after ordering; the line description stays the old name.

**Products**

10. Second active "House Espresso 1000 g Whole bean" → 409 `PRODUCT_VARIANT_EXISTS` naming it. Deactivate the first, then create the second → OK. Reactivate the first → 409.
11. Coffee product with a name, or a non-coffee product with a bag size → 400 `productKind`. Bag size `0`, `-250`, `250.5` → 400.
12. SKU `" he-1kg-wb "` is stored as `HE-1KG-WB`; a second `he-1kg-wb` → 409 `SKU_TAKEN`.
13. Display name: 250 → `250 g`, 1000 → `1 kg`, 1500 → `1.5 kg`, 2270 → `2.27 kg`. Non-coffee → its name.
14. Product list sort and search (coffee name, product name, SKU), status filter, `kind` filter. Orderable list excludes inactive products and products of inactive coffees.

**Calendar and cut-off** (inject the clock; use the UTC instants in §5.2)

15. The four "now" examples and the two delivery→roast examples in §5.2.
16. DST: the four oracles in §5.2 (AEDT and AEST), and exactly 12:00:00 Sydney counts as past cut-off.
17. Closures: the Christmas example in §5.2. A closure on the cut-off day moves the cut-off to the business day before. A closure on the delivery day pushes delivery to the next delivery day.
18. Settings: change `roastDays` to Mon and Thu with `deliveryDays` Mon to Fri (OQ-PO-8 scenario): Tue 10:00 → roast Thu, deliver Fri. `deliveryLagBusinessDays = 0` → deliver on the roast day. `cutoffLeadBusinessDays = 0` → cut-off on the roast day itself.
19. Hard rules: delivery yesterday, roast yesterday, roast after delivery → 400 for every role, including ADMIN.
20. Off-schedule as STAFF on a new order (rush dates, or the cut-off passed while the form was open) → 409 `SCHEDULE_OVERRIDE_REQUIRED` with `suggestion`. As MANAGER → 201 with `afterCutoff: true`. Re-dating to an on-schedule slot clears `afterCutoff`. A notes-only save never changes it.
21. A CONFIRMED order whose cut-off passes: STAFF line or date change → 403 `PAST_CUTOFF`. A STAFF notes change → 200. A MANAGER change → 200 and `afterCutoff: true`.
22. `pastCutoff` in the list/detail flips at the cut-off without any write.

**Status machine and permissions**

23. Every allowed transition, and every disallowed one (e.g. DRAFT → pack, DELIVERED → cancel, CANCELLED → anything) → 409 `INVALID_TRANSITION`.
24. Confirm with 0 lines → `ORDER_EMPTY`. Confirm for an inactive customer/branch → `CUSTOMER_INACTIVE`/`BRANCH_INACTIVE`. A customer deactivated after confirm: pack and deliver still work, and the detail shows `customer.isActive: false`.
25. Cancel: STAFF can cancel a DRAFT at any time, and a CONFIRMED order before cut-off. STAFF can't cancel CONFIRMED past cut-off, PACKED or DISPATCHED (403). Reason is required (blank → 400). A cancelled order keeps its lines and totals.
26. Short supply on PACKED: MANAGER reduces 12 → 10 with a reason → totals recompute and an event is written. Raising 10 → 11 or adding a product → `ORDER_NOT_EDITABLE`. Removing the last line → `ORDER_EMPTY`. STAFF trying it → 403 `SHORT_SUPPLY`. Changing the roast date on PACKED → `ORDER_NOT_EDITABLE`.
27. Revert (Should): PACKED → CONFIRMED clears `packedAt` and keeps `confirmedAt`. Delete (Should): a DRAFT never confirmed → 204. A DRAFT reverted from CONFIRMED → `ORDER_NOT_DELETABLE`.
28. `allowedActions` matches the rules for each role × status × before/after cut-off (table-driven test).
29. Each role against each endpoint's static permission (STAFF → 403 on `products:write`, `orders:late-change`, `settings:roast-calendar`; MANAGER → 403 on `PUT /roast-calendar`).

**Concurrency and idempotency**

30. Two PATCHes with the same `version`: one 200, one `VERSION_CONFLICT`. Two simultaneous confirms: exactly one CONFIRMED event.
31. `POST /orders` twice with the same `requestId` → one order, the second response 200 with the same id. The same `requestId` from another user → `REQUEST_ID_REUSED`.

**Lines**

32. Quantity `0`, `-1`, `1.5`, `"2"`, missing, `1000` → 400 at `lines.<i>.quantity`. Duplicate product → 400 `duplicateProduct`. A DRAFT with zero lines saves.
33. `totalWeightGrams`: 12 × 1 kg + 2 × 250 g + 2 tubs (non-coffee) = 12,500.

**List and search**

34. Default statuses exclude DELIVERED and CANCELLED. `status=CANCELLED` shows cancelled orders. A bad status value → 400.
35. Search `1001`, `ORD-1001`, `ord1001` → ORD-1001. `10` → prefix matches. A customer trading name, a legal name and a branch name each match.
36. Sort: delivery date, then customer display name (case-insensitive), then branch name, then number. `deliveryTo < deliveryFrom` → 400. A page past the end → empty `items`.
37. `productId` filter counts orders containing that product.

**Roast summary (Should)**

38. Only CONFIRMED orders for that roast date. Non-coffee lines are excluded. Two products of one coffee add up (`1 kg × 12 + 250 g × 4` = 13,000 g for House Espresso).

## 8. Web (for frontend-developer)

Routes (TanStack Router, under `_authed`; search params validated and in the URL):

| Route                                            | Screen                                                                                                                                                                        | Search params                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/products`                                      | Product list (P4): coffee, size, grind, SKU, price ex-GST, tax code, status                                                                                                   | `page`, `search`, `status`, `kind`, `coffeeId`                                                               |
| `/products/new`                                  | Create product: Coffee product (coffee, size, grind) or Other (name). Tax code pre-selected GST-free for coffee, GST for other, with "Tax code: confirm with your accountant" | `coffeeId` (prefill)                                                                                         |
| `/products/$productId`                           | View/edit price, tax code, SKU; (de)activate; P2 warning "N open orders still use the old tax code"                                                                           |                                                                                                              |
| `/coffees`, `/coffees/new`, `/coffees/$coffeeId` | Coffee list/create; coffee detail with its products and "Add product"                                                                                                         | `status`, `search`                                                                                           |
| `/orders`                                        | Order list (L1)                                                                                                                                                               | `page`, `search`, `status` (comma list), `deliveryFrom`, `deliveryTo`, `roastDate`, `customerId`, `branchId` |
| `/orders/new`                                    | New order (O1, O2): customer → branch (only active, auto-select a single one), dates (prefilled from `GET /orders/schedule`), lines, notes; live totals as an **estimate**    | `branchId`, `copyFrom` (Should)                                                                              |
| `/orders/$orderId`                               | Order detail (L2): branch address and delivery notes (read-only), lines with tax codes, ex/GST/inc totals, status actions from `allowedActions`, warnings, history (S3)       |                                                                                                              |
| `/orders/roast-summary` (Should)                 | kg per coffee for a roast date (L3)                                                                                                                                           | `roastDate`                                                                                                  |
| `/settings/roast-calendar` (Should)              | Calendar settings and closure days (ADMIN)                                                                                                                                    |                                                                                                              |

- **Default order list:** if the URL has none of `deliveryFrom`, `deliveryTo`, `roastDate`, `search`, send `deliveryFrom=<today Sydney>` (`todayInSydney()` in `shared/lib/dates.ts`) and the default statuses. Keep the URL clean in that case. Once the user sets any of those, send exactly what is in the URL.
- **Hide controls by `user.permissions` and `order.allowedActions`, never by role.** `allowedActions` already encodes status × cut-off × role, so the web must not re-implement the S1 table.
- **Money:**
  - Strings from the API, shown with `formatAud`.
  - A live estimate on the new/edit order form needs `big.js` (not yet a dependency; check the package-age policy). It uses the same rule as §3, and the label makes clear the saved figures come from the server.
  - Weight: `totalWeightGrams / 1000` formatted as kg (`14.5 kg`), as a string operation or integer maths. It is grams, not money, so a plain `number` is fine.
- **Dates:**
  - `YYYY-MM-DD` strings, shown with `formatBusinessDate`.
  - When the user changes the delivery date, call `GET /orders/schedule?deliveryDate=` and set the roast date from the response. If `onSchedule` is false, show the reasons before saving.
  - Warn (don't block) for a delivery more than 90 days ahead.
  - Show the cut-off as "Cut-off: Tue 24 Nov, 12:00 pm".
- **Error handling:**
  - `PRICE_CHANGED`: show old → new per line, refresh the orderable products, keep the other lines.
  - `PRODUCT_UNAVAILABLE`: highlight the line.
  - `SCHEDULE_OVERRIDE_REQUIRED`: message "Cut-off for <roast date> has passed — ask a manager or pick the next date" with a button to apply `meta.suggestion`.
  - `VERSION_CONFLICT` and `INVALID_TRANSITION`: toast and refetch.
  - `CUSTOMER_INACTIVE`/`BRANCH_INACTIVE`: link to the customer.
- **Idempotency:** generate `requestId` (`crypto.randomUUID()`) once when the new-order form mounts and reuse it on retries. Disable Save/Confirm while pending.
- **Query keys:** `productKeys.list(params)`, `productKeys.orderable()`, `productKeys.detail(id)`, `coffeeKeys.list(params)`, `coffeeKeys.detail(id)`, `grindKeys.all`, `orderKeys.list(params)`, `orderKeys.detail(id)`, `orderKeys.schedule(deliveryDate?)`, `orderKeys.roastSummary(date)`, `['roast-calendar']`. Order mutations invalidate `orderKeys.detail(id)` and `orderKeys.lists()`. Product/coffee mutations invalidate `productKeys.all` and `coffeeKeys.all`.
- **Customer page (L4 Should):** a "Recent orders" panel using `GET /orders?customerId=<id>&status=DRAFT,CONFIRMED,PACKED,DISPATCHED,DELIVERED,CANCELLED&pageSize=10`. "New order" on a branch row links to `/orders/new?branchId=`.
- **Empty states:** the brief's E table. "No products yet" is driven by `GET /products/orderable` being empty.

## 9. Later, without redoing orders

| Later feature                       | How it fits                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-customer prices (G2)            | New `CustomerPrice(customerId, productId, priceExGst, validFrom)`. At line creation the snapshot price is the customer price, else the list price. Add `OrderItem.listPriceExGst` (nullable, for discount reporting). `expectedUnitPriceExGst` already compares against "the price the server will charge", so the contract stays. |
| Standing orders (G3)                | New `StandingOrder(branchId, weekdays/frequency, lines, pausedUntil)` that **generates** ordinary `Order` rows. Add nullable `Order.standingOrderId` + unique `(standingOrderId, deliveryDate)` so generation is idempotent and "skip this week" is a cancelled or absent occurrence.                                              |
| MYOB invoice (G6, G22)              | Under option A an invoice can cover several orders (Q4), so the MYOB id belongs on `Invoice` (`myobInvoiceUid`, sync status) with frozen `InvoiceLine`s copied from `OrderItem` (same figures, §3). `Order.invoiceId` already exists (now `Restrict`). The trigger is the DELIVERED transition.                                    |
| Kg-to-roast report (G5)             | Already derivable: CONFIRMED orders by `roastDate` → lines → `product.coffeeId × bagSizeGrams × quantity` (L3 does exactly this). Yield per coffee is a later `Coffee` column.                                                                                                                                                     |
| Stock deductions                    | On PACKED (or DELIVERED), `inventory` decrements by line. `inventory → products` dependency only; orders would emit an event rather than call inventory.                                                                                                                                                                           |
| Per-branch delivery days, runs (G4) | `BranchDeliveryDay` overrides `deliveryDays`; `RoastCalendarService.suggest` gains an optional `branchId`.                                                                                                                                                                                                                         |
| NSW public holidays import          | Rows in `closure_days`.                                                                                                                                                                                                                                                                                                            |
