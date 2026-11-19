# Ordering (staff-entered orders)

## Goal

Roastery staff can record a cafe's order (what coffee, what bag size, how many, for which branch, for which delivery day), see and change it until it is locked for roasting, and see what has to be roasted and delivered. This is the first feature on top of the customers and branches slice (`docs/briefs/auth-and-customers.md`).

## Scope

- In:
  - Products the roaster sells, with the coffee separate from the bag size and grind, one list price per product, and a tax code (`GST` or `GST_FREE`). See G1 in `docs/domain/schema-gap-analysis.md`.
  - Orders entered by staff for a branch of a customer: lines (product, quantity), delivery date, notes. Price and tax code are copied onto each line when the order is saved. GST per line, totals ex-GST / GST / inc-GST, all on the server.
  - Order status flow and what staff can change at each status (draft or confirmed, then roasted/packed, delivered, cancelled; the architect proposes the exact statuses against the existing `OrderStatus` enum).
  - Delivery date and roast date rules: which day a given order is roasted, order cut-off (G4). The product-owner proposes the defaults.
  - List and search orders (by customer, branch, status, delivery date). Web screens: product list/edit, new order, order list, order detail.
  - Roles: reuse the existing role and permission approach from the auth slice.
- Out (later phases):
  - Standing (repeat) orders and skip/change one delivery (G3). Design so they can be added without redoing orders.
  - A cafe-facing ordering portal (cafes do not log in).
  - Customer-specific prices and volume tiers (G2). One list price now; keep the price on the order line so per-customer prices can be added later.
  - Creating the invoice in MYOB and reading payment status (G22). Do not build invoicing, payments or credit notes here. An order must keep what the invoice will need later (frozen price, tax code, GST per line).
  - Inventory deductions, blends/recipes, the "kg to roast" report (G5), stock levels. Mention what the order must record so these can be built next.

## Context

- Settled by the user (this session): Q2 staff enter the orders (phone, text or email from the cafe); standing orders are a later phase; Q3 one list price for everyone.
- Settled earlier: the roaster uses MYOB (Q1). MYOB stays the system of record for invoice numbering, payments, credit notes and BAS; our app will later create the invoice in MYOB when an order is delivered (`docs/domain/myob-integration.md`).
- Still unanswered, so anything built on them is an assumption to confirm with the roaster: Q4 (invoice grouping), Q5 (the real product range, bag sizes, blends, grind), Q6 (roast and delivery days, cut-offs, courier vs own van), Q7 (minimum order or delivery fee), Q9 (short-supply handling). Use sensible, changeable defaults and mark them clearly; do not present them as facts.
- Money is AUD `Decimal(12,2)`, never JS number arithmetic. GST is per line by `TaxCode`: `GST` = 10% rounded to cents, `GST_FREE` = 0 (most coffee beans are GST-free; merch and equipment attract GST). Business dates (delivery, roast) are plain `Australia/Sydney` dates, never parsed with `new Date()`. Timestamps are UTC `timestamptz`.
- Existing: `Product`, `InventoryItem`, `Order`, `OrderItem` models and empty `orders` and `inventory` modules. The product-owner's gap analysis says the current `Product` does not separate coffee from bag size (G1); the architect decides how to change the schema and migrates it.
- Build on the auth slice's patterns: permission-based guards, the `code` + `fieldErrors` error contract, URL-driven list state on the web, MSW tests on the web, testcontainers e2e on the API. `pnpm check` now includes the API e2e suite and needs Docker running.
- Web and API run locally only (no deployment yet).

## Acceptance criteria

Owner: product-owner. Labels follow `docs/domain/wholesale-roaster-flow.md`: **[Confirmed]**, **[Common practice]**, **[Assumption — confirm with roaster]**, **[Assumption — confirm with accountant]**. Priority: **Must** (this slice), **Should** (this slice if cheap, else next), **Later**.

### Example range used in the stories (not facts)

The roaster's real range is unanswered (Q5). The stories use this **made-up** range only to make the criteria testable. Staff will enter the real range through the product screens. Nothing here should be seeded as real data.

| Coffee (what is roasted)      | Products (what is sold)                                | List price ex-GST      | Tax code (example only) |
| ----------------------------- | ------------------------------------------------------ | ---------------------- | ----------------------- |
| House Espresso (blend)        | 1 kg whole bean; 1 kg espresso grind; 250 g whole bean | $34.00; $34.00; $11.50 | GST-free                |
| Ethiopia Guji (single origin) | 1 kg whole bean; 250 g filter grind                    | $42.00; $14.00         | GST-free                |
| Decaf Colombia                | 1 kg whole bean                                        | $38.00                 | GST-free                |
| (no coffee) Cleaning tablets  | Tub of 100                                             | $18.18                 | GST                     |

Tax codes in this table are for testing only. The classification of every real product is **[Assumption — confirm with accountant]** (A1). Coffee beans, roasted or ground, are GST-free on the ATO food list ([ATO GST-free food](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/gst-and-food/gst-free-food)). **[Confirmed]** at ATO level.

### Role permissions (proposed)

**[Assumption — confirm with roaster]** (Q14, OQ-PO-1). This extends the auth-slice matrix (D-PO-7) and must stay just as easy to change.

| Action                                                                                  | ADMIN | MANAGER | STAFF |
| --------------------------------------------------------------------------------------- | :---: | :-----: | :---: |
| View coffees, products and prices                                                       |  Yes  |   Yes   |  Yes  |
| Create/edit coffees and products, change list price and tax code, deactivate/reactivate |  Yes  |   Yes   |  No   |
| View orders                                                                             |  Yes  |   Yes   |  Yes  |
| Create, edit and confirm an order **before** its cut-off                                |  Yes  |   Yes   |  Yes  |
| Cancel an order **before** its cut-off                                                  |  Yes  |   Yes   |  Yes  |
| Change or cancel an order **after** its cut-off (late change)                           |  Yes  |   Yes   |  No   |
| Mark packed / dispatched / delivered                                                    |  Yes  |   Yes   |  Yes  |
| Reduce quantities at packing (short supply)                                             |  Yes  |   Yes   |  No   |
| Change roast/delivery calendar settings (roast days, cut-off)                           |  Yes  |   No    |  No   |

Why STAFF may take and confirm orders: in a small roastery whoever answers the phone takes the order. **[Common practice]**. Late changes are restricted because the coffee may already be in the roast plan.

### P. Products (coffee vs bag size vs grind)

**P1 (Must).** As the owner, I want to set up each coffee once and sell it in several bag sizes and grinds, so that orders for "House Espresso" in any pack add up to one roast demand later (G1, G5).

- A **coffee** has a name, a type (single origin or blend), and an optional description. It is what gets roasted.
- A **product** is one sellable item: a coffee + bag size (grams) + grind, with its own SKU, list price ex-GST per bag, and tax code. Example: House Espresso, 1000 g, whole bean.
- Grind values: Whole bean, Espresso, Filter. **[Assumption — confirm with roaster]** (Q5); the list must be changeable without a code change to orders.
- Given a coffee and bag size and grind that already exist as an active product, when another is created, then it is rejected ("House Espresso 1 kg whole bean already exists").
- Given bag size is not a whole number of grams greater than 0, then a field error is shown.
- **Non-coffee products** (e.g. cleaning tablets) exist without a coffee, bag size or grind and still have SKU, name, price and tax code. **[Common practice]**: roasters sell consumables alongside coffee. Their kg do not count toward roast demand.
- Given a product is shown anywhere (pickers, order lines), then its display name is built consistently, e.g. "House Espresso — 1 kg — Whole bean".

**P2 (Must).** As the owner, I want one list price and a tax code on each product so that orders are priced and taxed correctly (D-LEAD-3).

- Price is AUD ex-GST, greater than $0.00, at most 2 decimal places. Given `34.005` or `-1` or `0`, then a field error is shown.
- Tax code is required: `GST` or `GST_FREE`. The form pre-selects GST-free for coffee products and GST for non-coffee products, and shows "Tax code: confirm with your accountant" next to it. **[Assumption — confirm with accountant]** (A1).
- Given a list price is changed, when saved, then **existing order lines keep the price they were saved with**; only lines added afterwards use the new price. **[Common practice]** (orders snapshot the price; CLAUDE.md). Whether the roaster gives cafes notice of price rises (Q3) does not change this rule.
- Given a tax code is changed, then existing order lines keep their snapshotted tax code. **(Should)** Warn the user how many open (not delivered, not cancelled) orders still carry the old code.

**P3 (Must).** As the owner, I want to deactivate a coffee or product we no longer sell so that it can't be ordered by mistake, without losing order history.

- No hard delete of coffees or products once created (same as D-PO-2).
- Given a product is inactive, then it is not offered in the order line picker, but existing orders that contain it still show it (with an "Inactive product" badge) and can still be packed and delivered.
- Given a coffee is deactivated, then all its products are unavailable for new lines; their own active flag is not changed (same pattern as D-PO-4).

**P4 (Must).** As any staff member, I want a product list with search so that I can find a product's price quickly when a cafe asks.

- Default: active products, grouped or sorted by coffee name then bag size then grind; non-coffee products after. Search by coffee name, product name or SKU. Status filter Active/Inactive/All in the URL.
- Given no products exist, then "No products yet" with Add product for ADMIN/MANAGER, and "Ask a manager to add products" for STAFF.

### O. Creating and editing orders

**O1 (Must).** As production staff taking a phone call, I want to create an order for a cafe branch so that we roast and deliver the right coffee.

- Given the user picks a customer, then only that customer's **active** branches are offered. Given the customer has exactly one active branch, then it is pre-selected.
- Given the customer is inactive, or has no active branch, then an order can't be created and the message says why, with a link to the customer (D-PO-4 future rule in the auth brief).
- Given a new order, then it starts as **Draft**, with a suggested delivery date and roast date (see R1), and an order number is assigned. The order number is ours and must not look like a MYOB invoice number (MYOB owns invoice numbering, `myob-integration.md`). Format: architect's choice, short and easy to read out on the phone.
- Order notes (free text, e.g. "leave at back door this week only") are optional. The branch's standing delivery notes are shown read-only on the order.
- **(Should)** "Copy a previous order": start a new draft with the same lines as one of this branch's earlier orders, at **today's** list prices. This covers most repeat orders until standing orders exist (D-LEAD-2).

**O2 (Must).** As production staff, I want to add lines of products and whole-bag quantities so that the order says exactly what to pack.

- Each line: product + quantity. Quantity is a whole number of bags from 1 to 999. Given 0, a negative, a decimal (e.g. 1.5) or a blank, then a field error is shown. **[Common practice]**: wholesale is sold in whole bags.
- Given the same product is added twice, then it is rejected with "Already on this order — change the quantity instead". One line per product per order.
- Only active products of active coffees can be added.
- Given a line is added, then the unit price and tax code shown are the product's current list price and tax code, and these are what is saved (snapshot).
- Given the list price changed between the form loading and Save, then the save is rejected with a message showing the new price, and the form refreshes. Staff must never quote one total to a cafe and save another.
- A Draft may have zero lines. Confirming requires at least one line.
- **(Should)** The order shows its total weight in kg (sum of bag size × quantity, coffee products only), e.g. "14.5 kg". This is the number cafes and roasters talk in.

**O3 (Must).** As the bookkeeper, I want GST and totals worked out per line on the server so that the order already holds what the MYOB invoice will need.

- Line total ex-GST = quantity × unit price ex-GST, exact in cents.
- Line GST: `GST_FREE` = $0.00. `GST` = 10% of the line total ex-GST, rounded to the nearest cent, half a cent rounds **up**. **[Confirmed]** that half cents round up ([ATO tax invoices: rounding](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices)). Per-line rounding is the current rule in `CLAUDE.md`; the ATO also allows rounding on the invoice total, so per line vs total is **[Assumption — confirm with accountant]** (A3).
- Order totals: subtotal ex-GST = sum of line totals; GST = sum of line GST; total inc-GST = subtotal + GST.
- Worked examples the tests must cover:

  | Lines                                                                     | Subtotal ex-GST | GST   | Total inc-GST |
  | ------------------------------------------------------------------------- | --------------- | ----- | ------------- |
  | 12 × House Espresso 1 kg @ $34.00 (GST-free)                              | $408.00         | $0.00 | $408.00       |
  | 12 × House 1 kg @ $34.00 (GST-free) + 2 × Cleaning tablets @ $18.18 (GST) | $444.36         | $3.64 | $448.00       |
  | 3 × item @ $12.35 (GST): 37.05 × 10% = 3.705                              | $37.05          | $3.71 | $40.76        |
  | 1 × item @ $0.05 (GST): 0.005                                             | $0.05           | $0.01 | $0.06         |

  (Second row: 2 × 18.18 = 36.36; GST 3.636 rounds to $3.64.)

- Given an order mixes GST and GST-free lines, then each line shows its tax code clearly, because the future tax invoice must show which items are taxable. **[Confirmed]** ([Xero AU guide](https://www.xero.com/au/guides/tax-invoice-requirements/), restating ATO).
- All money is shown as AUD with two decimals; totals show ex-GST, GST and inc-GST separately.
- Totals our app shows may differ by a cent from the invoice MYOB calculates if MYOB rounds differently. This must be checked when the MYOB slice is built (A3, G22). It does not block this slice.

**O4 (Must).** As production staff, I want to edit an order before its cut-off so that late changes from the cafe ("add 2 kg decaf") are captured.

- What can be edited depends on status and cut-off, per the table in S1.
- Given a line's quantity is changed, then its unit price is **not** re-read from the list price (keeps the snapshot). Given a line is removed and re-added, then it gets the current price.
- Given a customer or branch is deactivated after an order was confirmed, then the order stays as is, shows a warning banner, and is not cancelled automatically. A MANAGER decides.
- **(Should)** Two people editing the same order: the second save is rejected with "This order was changed by someone else — reload", rather than last save wins. An order is money, unlike a phone number.

**O5 (Must).** As production staff, I want to cancel an order when a cafe calls it off so that it isn't roasted or delivered.

- Cancel requires a short reason (free text, e.g. "cafe closed for renovations").
- Given a Draft or Confirmed order before its cut-off, then any role may cancel it. After the cut-off, or once Packed, only ADMIN/MANAGER (coffee may already be roasted).
- Given a Delivered order, then it can't be cancelled. Corrections after delivery go through a credit note in MYOB (`myob-integration.md`). **[Common practice]**.
- A cancelled order keeps its lines, totals and reason, stays visible with the Cancelled filter, and can't be edited or un-cancelled. To restore it, copy it (O1 Should).
- No hard delete of orders, including Drafts. **(Should)** Allow deleting a Draft that has never been confirmed. **[Assumption]**: kept as Should because draft clutter is a minor problem.

### R. Delivery date, roast date and cut-off

**R1 (Must).** As production staff, I want the system to suggest the delivery and roast dates using the roaster's cut-off so that every order lands on the right roast day.

The rule (all values are **defaults, [Assumption — confirm with roaster]** (Q6), and must be settings, not code):

| Setting              | Default                                                               | Why this default                                                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roast days           | Monday to Friday                                                      | Simplest safe default. Many roasters roast only 2 to 3 fixed days (e.g. Mon/Thu) **[Common practice]** ([Marketlane](https://marketlane.com.au/pages/wholesale), [Seven Seeds](https://sevenseeds.com.au/pages/shipping-information)).                                           |
| Cut-off              | 12:00 noon, Sydney time, on the business day **before** the roast day | Cut-offs between 7:30 am and 5 pm the day before are common **[Common practice]** ([Merlo](https://www.merlo.com.au/pages/wholesale-faq), [Marketlane](https://marketlane.com.au/pages/wholesale), [RoasterTools](https://www.roastertools.com/blog/wholesale-order-deadlines)). |
| Delivery after roast | 1 business day (rest/degas, packing)                                  | Espresso is usually rested a day or more before use **[Common practice]** (`wholesale-roaster-flow.md` §6).                                                                                                                                                                      |
| Delivery days        | Monday to Friday                                                      | Assumption.                                                                                                                                                                                                                                                                      |

- Given now is before the cut-off for the next roast day, when a new order is created, then roast date = next roast day and delivery date = roast date + 1 business day.
  Example (defaults): order created Tuesday 10:00 Sydney → roast Wednesday → deliver Thursday.
- Given now is after the cut-off, then the order rolls to the following roast day. Example: Tuesday 12:01 → roast Thursday → deliver Friday.
- Given an order created Friday 15:00, then roast Tuesday (Monday's cut-off was Friday noon) → deliver Wednesday. Weekends are not business days.
- Cut-off compares against the current **Sydney** time, including daylight saving. Dates are plain Sydney dates (CLAUDE.md).
- Given staff change the **delivery date**, then the roast date is re-suggested as the latest roast day that still allows the delivery lag, and staff may then change the roast date too.
- Given staff pick a delivery or roast date earlier than the rule allows (a rush order), then it is allowed with a visible "After cut-off" warning on the order, and only for ADMIN/MANAGER. **[Common practice]**: roasters squeeze in rush orders.
- Given a delivery date before today (Sydney) or a roast date after the delivery date, then it is rejected.
- Given a delivery date more than 90 days ahead, then a warning is shown (likely a typo), not a block.

**R2 (Should).** As the owner, I want to mark closure days (public holidays, Christmas shutdown) so that suggested dates skip them.

- Given a closure day, then it is neither a roast day nor a delivery day, and the cut-off rolls to the business day before it. NSW public holidays are not loaded automatically in this slice; the owner enters them. **(Later)** Import NSW public holidays.
- Until R2 exists, staff override dates around holidays by hand (R1 override).

**R3 (Should).** As the owner, I want to change the roast days, cut-off time and delivery lag in a settings screen. For the Must, the values may come from configuration, but they must not be hard-coded in the date logic.

**Later:** per-branch delivery days and delivery runs (G4 full form, Q6), per-customer cut-offs, standing orders (G3).

### S. Status flow

**S1 (Must).** As production staff, I want each order to have a clear status so that everyone knows what is still changeable and what has gone out.

Business statuses (the architect maps these onto `OrderStatus`; the gap analysis recommends not tracking roasting per order):

```
Draft ──confirm──► Confirmed ──mark packed──► Packed ──(Should) mark dispatched──► Dispatched ──mark delivered──► Delivered
  │                    │                         │
  └──────cancel────────┴─────────cancel──────────┘──► Cancelled
```

- **Draft**: being taken; not counted in roast demand; not visible on the dispatch list.
- **Confirmed**: counts toward roast demand for its roast date. "Locked" is not a separate status: once the cut-off for the order's roast date passes, the order is **past cut-off** (derived from the time) and the rules below change.
- **Packed**: bags are packed and labelled.
- **Dispatched** (Should): left on the van or with the courier.
- **Delivered**: received by the cafe. This is the trigger for the future MYOB invoice (`myob-integration.md`, Option A).
- **Cancelled**: final.

Allowed moves: forward one step (Packed → Delivered allowed directly while Dispatched is a Should). **(Should)** One step back (e.g. Packed → Confirmed) for ADMIN/MANAGER with a reason, to fix a mis-click. Delivered and Cancelled are final.

What can be edited:

| Status                    | Lines (add, remove, qty)                                                | Delivery / roast date                                   | Notes | Cancel                     |
| ------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- | ----- | -------------------------- |
| Draft                     | Anyone                                                                  | Anyone (R1 rules)                                       | Yes   | Anyone                     |
| Confirmed, before cut-off | Anyone                                                                  | Anyone (R1 rules)                                       | Yes   | Anyone, with reason        |
| Confirmed, past cut-off   | ADMIN/MANAGER only, with "late change" warning                          | ADMIN/MANAGER only                                      | Yes   | ADMIN/MANAGER, with reason |
| Packed / Dispatched       | ADMIN/MANAGER: **reduce** quantity or remove a line only (short supply) | Delivery date only (e.g. van broke down), ADMIN/MANAGER | Yes   | ADMIN/MANAGER, with reason |
| Delivered                 | No                                                                      | No                                                      | Yes   | No (credit note in MYOB)   |
| Cancelled                 | No                                                                      | No                                                      | Yes   | —                          |

**S2 (Must).** As production staff, I want short supply handled simply so that a cafe is billed only for what it got.

- Default rule: if a coffee is short at packing, an ADMIN/MANAGER reduces that line (or removes it) on the Packed order, with a note. A substitute coffee is a new line added **before** Packed, or a separate new order. The Delivered order is what will be invoiced. **[Assumption — confirm with roaster]** (Q9). No backorder tracking in this slice (G17 Later/Should).
- Given a line is reduced to 0, then it is removed. Given all lines are removed, then the order must be cancelled instead of delivered.

**S3 (Should).** As the owner, I want to see who created, confirmed, changed and cancelled an order, and when, so that disputes ("we never ordered decaf") can be settled (G27).

### L. Order list and search

**L1 (Must).** As production staff, I want an order list filtered by delivery date and status so that I can see what goes out tomorrow.

- Default view: orders with a delivery date from today (Sydney) onward, statuses Draft, Confirmed, Packed and Dispatched, sorted by delivery date, then customer display name, then branch name.
- Filters (all in the URL): status (multi), delivery date from/to, roast date, customer, branch. Search by order number (exact or prefix), customer name (legal or trading), branch name.
- Each row: order number, delivery date, roast date, customer and branch, number of lines, total kg (Should), total inc-GST, status badge, and "After cut-off" / "Inactive customer" warnings.
- Paginated the same way as customers (D-AR-6).

**L2 (Must).** As any staff member, I want an order detail page that shows the branch's delivery address and notes, the lines with tax codes, and the totals so that I can pack and check it.

**L3 (Should).** As production staff, I want a per-roast-date summary of kg per coffee from Confirmed orders. This is the seed of the "kg to roast" report (G5), which is otherwise out of scope.

**L4 (Should).** On the customer page, list that customer's recent orders across all branches.

### E. Empty and error states (web)

| Case                                                     | Expected behaviour                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| No products exist                                        | New order is disabled with "Add products first" (link for ADMIN/MANAGER).                                                  |
| No customers / customer has no active branch             | "Add a branch to <customer> before taking an order" with a link (ADMIN/MANAGER) or "Ask a manager".                        |
| No orders match filters                                  | "No orders for these filters" + Clear filters. Default view empty: "No upcoming orders".                                   |
| Product went inactive while the form was open            | Save rejected naming the product; the line is highlighted; other lines are kept.                                           |
| List price changed while the form was open               | Save rejected showing old → new price (O2).                                                                                |
| Cut-off passed while the form was open (STAFF)           | Save rejected: "Cut-off for <roast date> has passed — ask a manager or pick the next date", with the next suggested dates. |
| Status changed by someone else (e.g. already Packed)     | Action rejected with the current status; page refreshes.                                                                   |
| Validation (400) / not found (404) / 401 / 403 / network | Same patterns as the auth brief, F1.                                                                                       |
| Double-click on Save or Confirm                          | Only one order is created / one status change happens.                                                                     |

### Which open questions block a Must story

None of Q4 to Q9 blocks **building** a Must story; each has a changeable default above. Two block **going live with real orders**:

| Question                                       | Default used                                                  | Blocks                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Q6 roast/delivery days, cut-off, courier/van   | Mon–Fri roast, noon day-before cut-off, deliver roast + 1 day | **Go-live** (R1 dates would be wrong). Not the build, since values are settings.                            |
| A1 (accountant) tax code per product           | Coffee GST-free, non-coffee GST, flagged                      | **Go-live** (wrong GST on every order).                                                                     |
| Q5 range, bag sizes, grinds, blends            | Example range; grinds Whole bean/Espresso/Filter              | Real data entry only. If the roaster sells non-whole-bag units (e.g. by the kg loose), O2 changes.          |
| Q9 short supply                                | Reduce lines at Packed; no backorders                         | Nothing in the build; may promote G17 later.                                                                |
| Q7 minimum order / delivery fee                | No minimum, no fee                                            | Nothing. If a fee exists, a "Delivery fee" non-coffee product (GST code per accountant) is a stopgap (G19). |
| Q4 invoice grouping                            | Not used in this slice                                        | Nothing here; needed for the MYOB slice.                                                                    |
| A3 (accountant) GST rounding per line vs total | Per line (CLAUDE.md)                                          | Nothing here; must match MYOB in the MYOB slice.                                                            |

### Gaps in `schema.prisma` for this slice

1. `Product` has no parent coffee and no grind; `origin`/`roastLevel` sit on the SKU (G1). Non-coffee products need coffee, bag size and grind to be optional.
2. `Order` has no roast date (only `requestedDeliveryDate`), no cancel reason or cancelled at/by, no "after cut-off" marker, and no stored totals.
3. `OrderItem` stores price and tax code but not line GST; the architect decides whether to store or derive (MYOB needs the exact figures later, G6).
4. `OrderStatus` includes `ROASTING`, which this flow does not use (gap analysis §3); `DISPATCHED` is Should.
5. No settings store for roast days, cut-off time, delivery lag, closure days (R1–R3).
6. No `createdBy`/`updatedBy` on orders (S3, G27).
7. `InventoryItem` cascade-deletes with `Product` (gap analysis §3). Harmless now that products are never deleted, but should become Restrict.

## Decisions

<!-- Teammates append here when they settle something others depend on. -->

- D-LEAD-1: Staff enter orders; cafes do not log in (Q2, user).
- D-LEAD-2: Standing orders are out of this slice (Q2, user).
- D-LEAD-3: One list price per product for all customers (Q3, user). Price is copied onto the order line.
- **D-PO-8 (product-owner):** A coffee (what is roasted) is separate from a product (coffee + bag size in grams + grind, with SKU, list price ex-GST and tax code). Non-coffee products have no coffee, bag size or grind. One active product per coffee + bag size + grind.
- **D-PO-9 (product-owner):** No hard delete of coffees, products or orders (Draft delete is a Should). Deactivating a coffee doesn't change its products' active flags.
- **D-PO-10 (product-owner):** Unit price and tax code are snapshotted when a line is added. Changing quantity keeps the snapshot; list-price or tax-code changes never alter existing lines. A save is rejected if the list price changed since the form loaded.
- **D-PO-11 (product-owner):** Quantities are whole bags, 1 to 999, one line per product per order.
- **D-PO-12 (product-owner):** GST per line: `GST` = 10% of the line ex-GST total rounded to the nearest cent, half up; `GST_FREE` = 0. Totals are sums of lines. The worked examples in O3 are the test oracle.
- **D-PO-13 (product-owner):** Each order stores a delivery date and a roast date (plain Sydney dates). Suggestions come from settings (roast days, cut-off time on the business day before, delivery lag), not hard-coded. Defaults: roast Mon–Fri, cut-off 12:00 Sydney, delivery = roast + 1 business day. These defaults are assumptions (Q6).
- **D-PO-14 (product-owner):** Business statuses are Draft, Confirmed, Packed, Dispatched (Should), Delivered, Cancelled. "Past cut-off" is derived, not a status. Delivered is the future MYOB invoice trigger. Delivered and Cancelled are final. The edit rules are the table in S1.
- **D-PO-15 (product-owner):** Our order number is separate from MYOB invoice numbers and must not look like them.
- **D-PO-16 (product-owner):** The role matrix in this brief's "Role permissions (proposed)" is the working default (Q14), enforced by the API.
- **D-AR-12 (architect):** Design note: `docs/design/ordering.md`. New `products` module owns `Coffee`, `Grind`, `Product`; `orders` owns `Order`, `OrderItem`, `OrderEvent` and the roast calendar; `inventory` is unchanged. Migration `20261119082000_ordering_catalogue_and_orders` is applied.
- **D-AR-13 (architect):** Cross-module business rules go through the owning service (`CustomersService.getBranchForOrdering`, `ProductsService.findForOrderLines`). Read-only SQL joins into another module's tables are allowed for list/detail queries; writes never.
- **D-AR-14 (architect):** New permissions: `products:read` (all), `products:write` (A/M), `orders:read` (all), `orders:write` (all), `orders:late-change` (A/M), `orders:fulfil` (all), `orders:short-supply` (A/M), `settings:roast-calendar` (ADMIN only). MANAGER is no longer "all permissions". Orders carry `allowedActions` for the current user, so the web never re-implements the S1 table.
- **D-AR-15 (architect):** Order numbers are an integer sequence from 1001, shown as `ORD-1001`. Search accepts `1001`, `ORD-1001` or `ord1001` (prefix match).
- **D-AR-16 (architect):** GST and totals are computed on the server with `Prisma.Decimal`, half-up per line, and stored on both lines (`lineTotalExGst`, `gstAmount`, `lineTotalIncGst`) and the order. Money is a 2-decimal string in DTOs; request prices are strings > 0 with at most 2 decimals and at most 9999.99; at most 200 lines per order.
- **D-AR-17 (architect):** The roast calendar is one DB row (roast, delivery and business weekdays; cut-off time; cut-off lead and delivery lag in business days) plus `closure_days`, seeded with the D-PO-13 defaults. The cut-off is compared as Sydney wall-clock time; exactly 12:00:00 is past. Changing settings never moves existing orders.
- **D-AR-18 (architect):** `OrderStatus` = DRAFT, CONFIRMED, PACKED, DISPATCHED, DELIVERED, CANCELLED (`ROASTING` removed). Transitions and preconditions in the design note §4; revert (Should) needs a reason and `orders:late-change`.
- **D-AR-19 (architect):** Every order write sends `version` (409 `VERSION_CONFLICT` if stale). `POST /orders` and copy are idempotent through a client `requestId`.
- **D-AR-20 (architect):** `PATCH /orders/:id` replaces the full set of lines. A product already on the order keeps its snapshot; a new line must send the price and tax code the form showed, else 409 `PRICE_CHANGED`. One line per product.
- **D-AR-21 (architect):** A coffee product's coffee, bag size and grind never change after creation. Its display name is `<coffee> — <size> — <grind>` (`250 g`, `1 kg`, `1.5 kg`) and is snapshotted onto order lines. Grinds are a table (seeded Whole bean, Espresso, Filter), not an enum.
- **D-AR-22 (architect):** Off-schedule saves (cut-off passed, not a roast or delivery day, delivery too soon) need `orders:late-change` and set the stored `afterCutoff` flag. Without that permission: 409 `SCHEDULE_OVERRIDE_REQUIRED` with suggested dates for a draft or new order, and 403 `PAST_CUTOFF` for a confirmed order past its cut-off. Notes can always be edited.
- **D-AR-23 (architect):** Order list: `GET /orders` with `status` (comma list, default open statuses), `deliveryFrom`/`deliveryTo`, `roastDate`, `customerId`, `branchId`, `productId`, `search`. There is no implicit date filter in the API; the web's default view sends `deliveryFrom=today`.
- **D-AR-24 (architect):** Room for later features (design note §9): customer prices and standing orders are additive tables and columns; the MYOB invoice id goes on `Invoice` (an invoice may cover several orders, Q4); DELIVERED is the MYOB trigger.
- **D-AR-25 (architect):** `orders.totalWeightGrams` is `BIGINT`, with no per-order weight cap (200 lines × 999 × 100 kg overflowed Int4 and gave a 500). DTOs still send a JSON number. Migration `20261119090454_ordering_review_fixes`.
- **D-AR-26 (architect):** The roast calendar's weekday arrays must be non-null, enforced in the CHECK (`IS NOT NULL`). The columns stay nullable because Prisma creates `Int[]` that way and a NOT NULL column would show as drift. The API always requires them.
- **D-AR-27 (architect):** Coffee and grind names are unique case-insensitively, ignoring outer spaces, enforced by DB expression indexes on `lower(btrim(name))`. A violation maps to `COFFEE_NAME_TAKEN` / `GRIND_NAME_TAKEN`.
- **D-AR-28 (architect):** A roast date derived from a delivery date is clamped to today if it would be in the past (a same-day rush is off schedule, not an error). A past `deliveryDate` is rejected with 400 on `deliveryDate` before anything is derived, in both `GET /orders/schedule` and `POST /orders`. Field errors only name fields the user sent.
- **D-BE-2 (backend-developer):** Ordering API implemented as in `docs/design/ordering.md`. Details others may depend on: (a) `Clock` (`common/clock.ts`) is provided by `OrdersModule`; tests override it with `overrideProvider(Clock)`. (b) `RoastCalendarService` caches settings and closures for 60 s of real time; a change made directly in SQL needs `invalidate()` (API changes clear it). (c) DTO validation runs before the order is loaded, so a malformed body on an unknown id is 400, not 404. (d) A `fieldErrors` entry now reports the top-most failing decorator (the most basic check, e.g. "is required"), not the bottom-most. (e) `status` on `GET /orders` is validated in the service (400 field `status`, code `isIn`). (f) A CONFIRMED order saved off schedule for a reason other than its stored roast date being past cut-off (for example a new date that is not a roast day) gives 409 `SCHEDULE_OVERRIDE_REQUIRED` without `orders:late-change`; 403 `PAST_CUTOFF` is only for changing an order whose stored roast date is past cut-off. (g) A roast date derived from a delivery date (`POST /orders` without `roastDate`, `GET /orders/schedule?deliveryDate=`) is clamped to today (Sydney) if it would be in the past, so a same-day rush is off schedule (409 `SCHEDULE_OVERRIDE_REQUIRED` for STAFF, `afterCutoff` for MANAGER); an explicit past `roastDate` is still 400. (h) `GET /orders/:id` and every write response return the full `OrderDto` including `events`. (i) MANAGER permissions are listed explicitly in `modules/auth/permissions.ts`.

## Open questions

Product-owner questions for the user/roaster. Defaults apply until they are answered (see "Which open questions block a Must story"):

- **Q6 (blocks go-live):** Which days do you roast, which days do you deliver, and what is your order cut-off (time and day)? Do you deliver the same day you roast or the next day?
- **A1 (accountant, blocks go-live):** Tax code for each product you sell, especially anything that isn't plain coffee beans.
- **Q5:** Your real coffees, bag sizes and grinds. Do you ever sell coffee loose by the kg rather than in bags?
- **Q9:** When you're short of a coffee, do you send less and bill less, swap the coffee, or hold the order?
- **Q7:** Is there a minimum order or a delivery fee?
- **OQ-PO-7:** Should production staff be able to take and confirm orders, with only managers allowed to change an order after the cut-off (as proposed)?
- **OQ-PO-8:** Do you roast on fewer days than you deliver (e.g. roast Mon/Thu, deliver every weekday)? If yes, the "delivery = roast + 1 day" default is wrong, and delivery days need their own setting.
