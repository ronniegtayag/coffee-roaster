# Roaster and wholesale software landscape (what other tools do)

Owner: product-owner. Audience: the user and the team. Researched 2026-11-19.
Labels follow `wholesale-roaster-flow.md`. Vendor claims come from vendor marketing pages or help centres. They show what is **offered**, not how well it works, so they are labelled **[Common practice]** when several vendors offer the same thing. A feature that only one vendor lists is described as "vendor states".

## 1. Kinds of tools a roaster uses

| Kind                                 | Examples                            | What it is for                                                                  |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------- |
| Roast logging and production         | Cropster, Artisan (free), RoastPATH | Roast curves and profiles, quality/cupping, green stock, production planning    |
| All-in-one roastery operations       | RoasterTools, Roast Console         | Orders, wholesale portal, inventory, production plan, invoices, accounting sync |
| Wholesale ordering marketplaces (AU) | Ordermentum, Upstock                | Cafes order online; standing orders, cut-offs, payments, invoice sync           |
| Accounting                           | Xero, MYOB, QuickBooks              | Ledger, invoices/payments, BAS                                                  |

## 2. Features seen across vendors

| Feature                                                     | Who offers it                                                                                                           | Label                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Online wholesale ordering portal for cafes                  | RoasterTools, Upstock, Ordermentum                                                                                      | **[Common practice]**                                                                              |
| Standing/recurring orders that auto-generate before cut-off | Upstock, Ordermentum, RoasterTools (beta)                                                                               | **[Common practice]**                                                                              |
| Per-customer cut-offs and delivery days set by the supplier | Ordermentum, Upstock; RoasterTools assigns customers to production days                                                 | **[Common practice]**                                                                              |
| Customer-specific price lists / price levels                | RoasterTools, Upstock                                                                                                   | **[Common practice]**                                                                              |
| Minimum order values                                        | Upstock                                                                                                                 | vendor states                                                                                      |
| Invoice on order approval; consolidated invoices            | Upstock (both), RoasterTools (invoices)                                                                                 | **[Common practice]**                                                                              |
| Card payments and prepayment to cut overdue debt            | Upstock, RoasterTools (RoasterPay), Ordermentum                                                                         | **[Common practice]**                                                                              |
| Accounting sync                                             | Ordermentum lists Xero, MYOB, QuickBooks; Roast Console lists Xero; RoasterTools has QuickBooks with Xero "coming soon" | **[Common practice]**. This roaster uses **MYOB** (2026-11-19), so MYOB support matters, not Xero. |
| Green, roasted (WIP/blends) and packaged inventory          | RoasterTools, Cropster                                                                                                  | **[Common practice]**                                                                              |
| Demand calculator: orders turned into what to roast per day | RoasterTools ("live demand calculator"), Upstock (production reports), Cropster (resource planning)                     | **[Common practice]**                                                                              |
| Roast curve logging, machine connection, cupping/QC         | Cropster, Artisan                                                                                                       | **[Common practice]** for production tools; usually not inside a CRM                               |
| Shipping/courier integration                                | RoasterTools (ShipStation export)                                                                                       | vendor states (US-centric)                                                                         |
| E-commerce order import (Shopify etc.)                      | RoasterTools                                                                                                            | vendor states                                                                                      |

## 3. How our app compares (2026-11-19)

Built: staff login with roles, customers (billed business, ABN check), branches (cafe venues), list/search/deactivate. The orders, invoicing, inventory, suppliers and reports modules exist only as empty shells.

Behind: everything a cafe-facing or production-facing tool does (orders, standing orders, cut-offs, price lists, roast plan, invoicing/MYOB sync).

Possible differences worth keeping (**[Assumption — confirm with roaster]**):

- Built for one Sydney roaster's own workflow, not a marketplace. There are no per-order marketplace fees, and AU GST/ABN rules are built in.
- One place that links customer → standing order → roast plan → invoice. Today a roaster may use Ordermentum + Cropster + MYOB side by side.
- It does not try to replace MYOB (ledger, BAS; see `myob-integration.md`) or Cropster (roast curves). It links to them.

Before building any further, ask: does the roaster already pay for Ordermentum, Upstock or Cropster (Q1, Q2, Q11)? If yes, our app should integrate with them, not compete.

## Sources

- [RoasterTools pricing/features](https://roastertools.com/pricing)
- [Upstock for coffee roasters](https://upstock.app/for/coffee-roasters)
- [Ordermentum home](https://www.ordermentum.com/), [Ordermentum: supplier standing orders](https://help.ordermentum.com/supplier/en/articles/9186996-supplier-how-to-manage-a-standing-order), [Ordermentum: multiple cut-offs and lead times](https://help.ordermentum.com/supplier/en/articles/9186972-setting-up-multiple-cut-offs-lead-times), [Ordermentum: venue delivery schedule](https://help.ordermentum.com/venue/en/articles/15999545-managing-your-delivery-schedule-standing-orders)
- [Cropster production manager](https://www.cropster.com/solutions/production-manager/)
- [Roast Console (Sprudge)](https://sprudge.com/roastconsole-launches-coffee-roasting-software-that-runs-the-whole-roastery-on-one-plan-1356622.html), [Roast Console on Capterra](https://www.capterra.co.uk/software/1222107/Roast-Console)
