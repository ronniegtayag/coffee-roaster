# Wholesale specialty coffee roaster: end-to-end business flow

Owner: product-owner. Audience: developers who are new to the coffee industry.
Context: a wholesale specialty roaster in Sydney, NSW. It sells mostly to cafes. Amounts are in AUD with GST. Business dates use Australia/Sydney time.

## How to read this document

Each claim carries one of these labels:

| Label                                      | Meaning                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **[Confirmed]**                            | An authoritative source backs it (ATO, FSANZ, legislation). The link is given.                                               |
| **[Common practice]**                      | Seen across several roasters, importers or software vendors. It is not a legal rule, and this roaster may do it differently. |
| **[Assumption — confirm with roaster]**    | Our best guess. Do not build on it until the owner confirms it (see `questions-for-roaster.md`).                             |
| **[Assumption — confirm with accountant]** | Any tax or accounting treatment for this specific business. Product tax classification **always** carries this label.        |

---

## 1. Glossary

| Term                               | Plain meaning                                                                                                                                                                           | Why the developer cares                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Green coffee / green beans**     | Raw, unroasted coffee seeds. They are bought by the kilo and stored in sacks or boxes. Stable for months.                                                                               | This is the main raw material. It is a separate kind of stock from roasted coffee.                                                      |
| **Importer / green merchant**      | A company that buys coffee at origin, ships it to Australia, and sells it to roasters from a local warehouse. Examples: Melbourne Coffee Merchants, Sucafina, Cafe Imports.             | It is a **supplier**, but it sells a different kind of thing from packaging or freight suppliers.                                       |
| **Lot**                            | One specific coffee from one farm, washing station or co-op, harvest and process, sold under the importer's lot code. Example: "Ethiopia Guji Hambela, washed, lot 1234, 2026 harvest". | Traceability unit. The same "Ethiopia" product can move from one lot to the next across a year.                                         |
| **Spot vs forward**                | Spot means buying from stock already in the local warehouse. Forward means committing in advance to coffee that has not yet shipped or landed.                                          | Forward purchases are reserved stock that has not been received yet.                                                                    |
| **EXW (ex-warehouse)**             | The price applies at the importer's warehouse door. Delivery to the roastery is extra.                                                                                                  | Landed cost = green price + freight to the roastery (+ any other charges).                                                              |
| **Landed cost**                    | The full cost per kg to get green coffee into the roastery.                                                                                                                             | This is the input to cost of goods.                                                                                                     |
| **Roast / batch**                  | One run of the roasting machine. A batch has a set green weight in (e.g. 15 kg) and a roasted weight out.                                                                               | Production unit.                                                                                                                        |
| **Roast loss / shrinkage / yield** | The weight lost in roasting, mostly water. Loss % = (green in − roasted out) ÷ green in. Yield = 1 − loss.                                                                              | Producing 10 kg of roasted coffee takes roughly 11.5–12.5 kg of green.                                                                  |
| **Roast profile**                  | The recipe for time and temperature that the roaster follows for a given coffee. Logged by tools such as Cropster or Artisan.                                                           | Usually lives in roasting software rather than the CRM. Store a reference to it, not the curve.                                         |
| **Single origin**                  | A coffee from one origin or lot.                                                                                                                                                        | Simple product.                                                                                                                         |
| **Blend**                          | A product made from several coffees in set proportions. Example: "House Espresso" = 60% Brazil + 40% Colombia. Recipes change as lots run out.                                          | Needs a recipe (bill of materials). Blends are often roasted as separate components and mixed after roasting, or mixed before roasting. |
| **Espresso vs filter roast**       | Roasters often describe roasts by intended brew method rather than "light/dark".                                                                                                        | The existing `RoastLevel` enum may not match how this roaster talks.                                                                    |
| **Grind**                          | Whole bean, or ground for espresso, filter, plunger and so on.                                                                                                                          | Wholesale cafes almost always buy whole bean (they grind on site). Ground coffee matters more for offices and retail.                   |
| **Bag size**                       | Common wholesale sizes are 1 kg, sometimes 2.5 kg or 5 kg bags. Retail sizes are 250 g, 500 g and similar.                                                                              | One coffee is sold as several packaged SKUs.                                                                                            |
| **Roast date / best-before**       | The date roasted and the "best before" date printed on the bag.                                                                                                                         | Packaged food needs a date mark unless its shelf life is 2 years or more. See section 4.                                                |
| **Standing order**                 | A recurring order. Example: "Cafe X Surry Hills gets 12 kg House + 2 kg Decaf every Monday and Thursday".                                                                               | The core of wholesale revenue. Not in the schema.                                                                                       |
| **Cut-off**                        | The latest time an order can be placed to make a given roast or delivery day.                                                                                                           | Drives which roast/delivery day an order lands in.                                                                                      |
| **Delivery run**                   | The roaster's own van route on set days, or a courier service.                                                                                                                          | Groups orders for dispatch.                                                                                                             |
| **Free on loan (FOL) equipment**   | The roaster lends the cafe an espresso machine and grinder. In return the cafe commits to a minimum volume (kg per week). The equipment cost is built into the coffee price.            | Customer contract, minimum volume, assets and service jobs.                                                                             |
| **Tax invoice**                    | The invoice format the ATO requires for taxable sales (section 8).                                                                                                                      | Legal compliance.                                                                                                                       |
| **Adjustment note**                | The ATO term for a credit note that adjusts GST (section 9).                                                                                                                            | Needed for credits on taxable lines.                                                                                                    |
| **GST-free**                       | A sale with no GST charged. Most coffee beans, roasted or ground, are GST-free food.                                                                                                    | Each line needs a tax code. Invoices mix GST and GST-free lines.                                                                        |
| **COGS**                           | Cost of goods sold: green + packaging + labour/overheads, depending on the accountant's method.                                                                                         | Reporting margin by customer and product.                                                                                               |
| **Xero**                           | Common Australian small-business accounting software (MYOB and QuickBooks are alternatives).                                                                                            | Decides which system "owns" invoices and payments.                                                                                      |

---

## 2. The flow at a glance

```
 Importer ──(green purchase, lot)──► Green stock ──(roast plan)──► Roast batches ──► Roasted coffee (bulk)
                                                                                         │
                                                                         (pack: bag size, grind, label)
                                                                                         ▼
 Cafe account ──(standing / ad-hoc order, per branch)──► Order book ──► Pick & pack ──► Dispatch / delivery run
                                                                                         │
                                                         Invoice (per order or consolidated) ◄─┘
                                                                  │
                                               Payment / credit note / overdue follow-up
                                                                  │
                                       Accounting system (often Xero) + reports (sales, COGS, stock)
```

The order book drives production in reverse. Orders due for a roast day are added up into **kg of each coffee needed**. That is then turned into **kg of green needed** (allowing for roast loss and the blend recipe), and then into a **list of batches**.

---

## 3. Green bean sourcing and purchasing

**Actors:** owner/head roaster (buys), bookkeeper (pays the bill), importer (supplier).

**What happens**

1. The roaster cups samples sent by the importer. Melbourne Coffee Merchants sends 100 g green samples and 25 g roasted samples, and the roaster chooses lots. **[Common practice]** ([MCM how to order](https://melbournecoffeemerchants.com.au/how-to-order/))
2. The roaster buys **spot** (from stock already in the warehouse) or **forward** (committed in advance and reserved before landing). **[Common practice]** ([MCM](https://melbournecoffeemerchants.com.au/how-to-order/))
3. Units are whole bags or boxes. Common sizes are 30 kg (MCM), 60 kg sacks and 69/70 kg sacks. Sucafina's units range from 20 to 70 kg and cannot be split. **[Common practice]** ([MCM](https://melbournecoffeemerchants.com.au/how-to-order/), [Sucafina APAC](https://sucafina.com/apac/how-to-order))
4. Local importers quote a flat **AUD per kg, ex-warehouse**. Delivery to the roastery is charged on top. Some importers ask new or small customers to pay upfront. **[Common practice]** ([MCM](https://melbournecoffeemerchants.com.au/how-to-order/), [Sucafina](https://sucafina.com/apac/how-to-order))
5. If the roaster imports directly, extra costs apply: freight, insurance, customs brokerage and biosecurity fees per consignment. This is uncommon for a small roaster. **[Assumption — confirm with roaster]** ([indicative example](https://specialtycoffee.id/?p=13973))
6. The importer's invoice arrives and is entered as a **supplier bill**, usually in Xero. A separate freight invoice may follow. **[Common practice]**

**Data involved:** supplier (importer), purchase (lot code, origin, process, harvest, bag count × bag weight, price/kg, expected arrival), supplier invoice lines, freight invoice, received date and quantity.

**Landed cost** = (green price × kg + freight + other allocable charges) ÷ kg received. How costs are allocated, and whether freight is capitalised into stock, is an accounting policy. **[Assumption — confirm with accountant]**

**GST on green purchases.** Green coffee beans appear as GST-free on the ATO food list. Freight and other services on the bill are usually taxable. **[Confirmed]** for beans, per the ATO detailed food list ([ATO GST-free food](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/gst-and-food/gst-free-food), [ATO detailed food list](https://www.ato.gov.au/Business/GST/In-detail/Your-industry/Food/Detailed-food-list/)). The treatment of each bill line for this business is **[Assumption — confirm with accountant]**. Supplier bills will therefore mix GST and GST-free lines.

## 4. Green stock and roast planning

**Actors:** head roaster / production staff.

- Green stock is counted in **kg per lot**, often in bags. It is used up batch by batch. **[Common practice]** ([Cropster green inventory](https://www.cropster.com:443/solutions/production-manager/), [RoasterTools features](https://roastertools.com/pricing))
- **Roast planning:** add up confirmed and standing orders for the next roast day per coffee in kg. Add a buffer for retail, café top-ups and samples. Subtract roasted stock on hand. Convert to green kg using the expected yield and blend recipe, then split into batches by machine capacity. **[Common practice]** ([Cropster: linking orders to roast logs](https://www.cropster.com/app/uploads/2026/04/No-More-Sunday-Night-Scramble-The-blueprint-for-linking-orders-to-roast-logs-and-scaling-without-the-stress-1.pdf), [FreshCup demand planning](https://freshcup.com/waste-no-beans-a-demand-planning-guide-for-roasters/))
- Many wholesale roasters **roast to order** on fixed roast days, so very little roasted stock sits on the shelf. **[Common practice]** ([Marketlane wholesale](https://marketlane.com.au/pages/wholesale), [Central Coast Coffee](https://www.centralcoastcoffee.com.au/pages/shipping-delivery))
- Roast days, machine batch size (e.g. 5/12/15/30 kg) and whether blends are pre- or post-roast blended are all **[Assumption — confirm with roaster]**.

## 5. Roasting batches (yield, profiles, traceability)

**Actors:** roaster operator.

- Each batch records the date, machine, profile, lot(s) and green kg in, roasted kg out, and the operator. Roast-logging software (Cropster, Artisan, RoastPATH, Roast Console) records the curve. **[Common practice]** ([Mahalia Coffee: batch numbers](https://mahaliacoffee.com.au/blogs/coffee-community-our-blog/best-before-and-roast-date), [Roast Console](https://sprudge.com/roastconsole-launches-coffee-roasting-software-that-runs-the-whole-roastery-on-one-plan-1356622.html))
- **Roast loss** is typically about **12–20%**, and up to about 24% for very dark roasts. Light to medium specialty roasts lose roughly 11–16%. Most of the loss is moisture, so it varies by lot and by roast level. **[Common practice]** ([Barista Hustle](https://baristahustle.com/?p=453522), [Royal Coffee](https://royalcoffee.com/understanding-roast-yield-and-loss/), [Green Coffee Collective](https://greencoffeecollective.com/pages/glossary/roast-loss)). Use **actual** in/out weights per batch, not one fixed constant.
- **Traceability chain:** green lot → roast batch → packing run → bags → customer delivery. Software vendors note that the roast-to-pack step is where traceability usually breaks. **[Common practice]** ([Cropster blueprint](https://www.cropster.com/app/uploads/2026/04/No-More-Sunday-Night-Scramble-The-blueprint-for-linking-orders-to-roast-logs-and-scaling-without-the-stress-1.pdf))
- **Recall obligation:** food businesses that do wholesale supply or manufacture must have a written food recall system under Food Standards Code Standard 3.2.2 cl. 12. **[Confirmed]** ([FSANZ food recalls](https://www.foodstandards.gov.au/business/food-recalls), [WA Health food recalls](https://health.wa.gov.au/Articles/F_I/Food-recalls)). The law does not require _software_ traceability. It does mean "which customers received batch X" is a question the business must be able to answer. **[Assumption — confirm with roaster]**: is a paper record acceptable to them today?
- Whether to store roast curves in the CRM or just link to the roasting tool is **[Assumption — confirm with roaster]**. Recommendation: link only.

## 6. Packing and labelling

**Actors:** production / packing staff.

- Roasted coffee rests, often 1+ day for espresso (degassing). It is then packed into bags with one-way valves. Wholesale bags are usually 1 kg. **[Common practice]** ([Seven Miles wholesale guide](https://www.sevenmiles.com.au/editorial/how-much-does-wholesale-coffee-cost/))
- Grinding is done to order where needed (offices, retail). Cafes buy whole bean. **[Common practice]** ([Central Coast Coffee: whole bean only for roast-to-order](https://www.centralcoastcoffee.com.au/pages/shipping-delivery))
- **Date marking:** packaged food must carry a best-before or use-by date unless its best-before is 2 years or more (Standard 1.2.5). Roasted coffee is normally given a shorter shelf life, so a best-before date is expected. **[Confirmed]** for the rule ([Standard 1.2.5 compilation](https://www.legislation.gov.au/F2015L00401/2021-06-03/2021-06-03/text/original/epub/OEBPS/document_1/document_1.html)). Applying it to bulk wholesale bags is **[Assumption — confirm with roaster]**, since some labelling rules differ for food not for retail sale.
- Specialty roasters also print the **roast date** and often a **batch number**. This is market expectation, not law. **[Common practice]** ([Mahalia](https://mahaliacoffee.com.au/blogs/news/best-before-and-roast-date), [Coffee Hero](https://coffeehero.com.au/blogs/news/how-to-read-a-coffee-bag-roast-date-origin-process-explained))
- **Country of origin labelling:** coffee is a _non-priority_ food, so a text statement is enough. Exact wording for "roasted in Australia from imported beans" should be checked against the ACCC guide. **[Confirmed]** for non-priority status ([business.gov.au CoOL](https://business.gov.au/products-and-services/product-labelling/country-of-origin-food-labelling), [ACCC](https://accc.gov.au/business/advertising-and-promotions/country-of-origin-food-labelling)). Wording is **[Assumption — confirm with roaster]**.
- Packaging (bags, valves, labels, boxes) is a consumable bought from packaging suppliers. Tracking it is optional and useful for COGS. **[Assumption — confirm with roaster]**

**Data involved:** packaged SKU (coffee × bag size × grind), packed quantity, batch reference, roast date, best-before date, label.

## 7. Wholesale account onboarding

**Actors:** sales/account manager, owner, bookkeeper, cafe owner.

- Capture the legal entity (legal name, **ABN**), trading name(s), billing contact and email, and accounts contact. For each venue (branch), capture the delivery address, access notes and delivery window. **[Common practice]**
- A buyer ABN is only _required_ on a tax invoice of $1,000 or more (section 8). Collecting it for every account is still good practice. **[Confirmed]** for the threshold ([Xero AU guide](https://www.xero.com/au/guides/tax-invoice-requirements/), [ATO tax invoices](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices))
- **Credit application and terms of trade:** payment terms (e.g. 7 or 14 days, or end-of-month + N days), credit limit, personal guarantee for small companies, and the right to stop supply on overdue. **[Common practice]** ([Sprintlaw: coffee roaster terms of trade](https://sprintlaw.com.au/articles/coffee-roaster-terms-trade/), [Sprintlaw: supplier agreements](https://sprintlaw.com.au/articles/coffee-supplier-agreements-roasters/))
- **Pricing:** wholesale is priced per kg. Typical Australian cafe pricing is about $32–$38/kg, ranging from about $22 to over $42/kg. Price depends on volume, coffee and whether equipment is supplied. So **different customers pay different prices for the same SKU**. **[Common practice]** ([Seven Miles](https://www.sevenmiles.com.au/editorial/how-much-does-wholesale-coffee-cost/), [Di Pacci price guides](https://dipacci.com.au/pages/wholesale-pricing))
- **Equipment on loan:** in Australia roasters often lend espresso machines and grinders in exchange for a minimum weekly volume. The figure was historically about 20 kg/week and is now reportedly 30 kg+. Contracts set the term, ownership, servicing and exit costs. **[Common practice]** ([Bean Scene: sourcing equipment](https://www.beanscenemag.com.au/a-guide-to-sourcing-the-right-coffee-making-equipment/), [Sprintlaw](https://sprintlaw.com.au/articles/coffee-supplier-agreements-roasters/)). Whether _this_ roaster does it is **[Assumption — confirm with roaster]**.
- **Minimums:** minimums can be per order, per week, or a monthly spend. Merlo publishes a 5 kg minimum and Veneziano a 12 kg minimum per shipment. **[Common practice]** ([Merlo wholesale FAQ](https://www.merlo.com.au/pages/wholesale-faq), [Sprintlaw](https://sprintlaw.com.au/articles/coffee-supplier-agreements-roasters/))
- Barista training and onboarding visits are common add-ons. **[Common practice]** ([Marketlane wholesale](https://marketlane.com.au/pages/wholesale))

## 8. Ordering

**Actors:** cafe owner or manager (places orders), account manager, production staff.

- **Standing orders** (same items, same days, every week) make up most wholesale volume. Ad-hoc top-ups come on top. Wholesale ordering platforms (e.g. Upstock) and roastery tools (e.g. RoasterTools) support recurring orders and per-customer cut-offs. **[Common practice]** ([Upstock for roasters](https://upstock.app/for/coffee-roasters), [RoasterTools](https://roastertools.com/pricing)). The actual share of standing orders here is **[Assumption — confirm with roaster]**.
- Orders arrive by email, SMS, phone, a B2B web shop (Shopify B2B, Upstock, Orderspace) or are entered by staff. **[Common practice]** ([Orderspace example](https://crownandcanvas.orderspace.com/pages/10089-placing-an-order))
- **Cut-offs and roast days:** Marketlane roasts Monday and Thursday and asks for orders by 5 pm the day before. Merlo's Sydney cut-off is noon for delivery within 2 business days. Seven Seeds roasts Monday, Wednesday and Friday with a 7:30 am cut-off. **[Common practice]** ([Marketlane](https://marketlane.com.au/pages/wholesale), [Merlo](https://www.merlo.com.au/pages/wholesale-faq), [Seven Seeds](https://sevenseeds.com.au/pages/shipping-information), [RoasterTools: order deadlines](https://www.roastertools.com/blog/wholesale-order-deadlines))
- A cafe with several venues usually orders **per venue** and may be billed **centrally**. **[Common practice]**. The current schema already models this as `Customer` → `Branch`.
- Public holiday and Christmas cut-off changes are common. **[Common practice]** ([Seven Seeds Christmas cut-offs](https://sevenseeds.com.au/blogs/seven-seeds-venue-news/christmas-cut-off-dates-are-here))

**Edge cases the system must handle:** a standing order is skipped one week ("closed for renovations"), or a one-off change is made to one occurrence. A product is out of stock or a lot runs out, so the cafe gets a substitute coffee. An order comes in after cut-off and moves to the next roast. An order is below the minimum. An account is on credit hold.

## 9. Dispatch and delivery

**Actors:** packing staff, driver or courier.

- Sydney metro: own van runs on fixed days, or a local courier. Interstate and regional: a national courier (e.g. Couriers Please, Australia Post, StarTrack). **[Common practice]** ([Seven Seeds shipping](https://sevenseeds.com.au/pages/shipping-information), [Sample Coffee wholesale](https://samplecoffee.com.au/pages/wholesale))
- Delivery is usually free above a minimum and charged as a freight line below it. **[Common practice]** ([Merlo](https://www.merlo.com.au/pages/wholesale-faq)). The GST treatment of freight charged alongside GST-free coffee is **[Assumption — confirm with accountant]**.
- **Partial delivery / backorder:** one coffee is short, so part of the order ships and the rest follows or is cancelled. **[Assumption — confirm with roaster]** on how often this happens and how it is invoiced (invoice on dispatch vs on order).
- Records: delivery docket or packing slip, proof of delivery (signature or photo), courier tracking number. **[Common practice]**

## 10. Invoicing (Australian tax invoice rules)

**Actors:** bookkeeper, account manager.

**Tax invoice contents.** For a taxable sale under $1,000 (GST-inclusive), the tax invoice must show:

1. That it is intended to be a tax invoice
2. The seller's identity
3. The seller's ABN
4. The date of issue
5. A brief description of each item sold, with quantity and price
6. The GST amount, if any
7. How far each item includes GST

For **$1,000 or more**, it must also show the **buyer's identity or ABN**. **[Confirmed]** ([ATO tax invoices](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices), [Xero AU summary](https://www.xero.com/au/guides/tax-invoice-requirements/))

Further rules:

- **Mixed invoices:** an invoice with both GST and GST-free lines must show clearly which lines are taxable, for example by marking them or grouping them. **[Confirmed]** ([Xero AU guide](https://www.xero.com/au/guides/tax-invoice-requirements/), restating the ATO requirement)
- If a customer asks for a tax invoice for a taxable sale over $82.50 (GST-inclusive), it must be issued within **28 days**. **[Confirmed]** ([Xero AU guide](https://www.xero.com/au/guides/tax-invoice-requirements/))
- **GST-free coffee:** coffee beans, whether green, roasted or ground, and coffee for making a beverage are GST-free. Ready-to-drink coffee, chocolate-coated beans and coffee served as a drink are taxable. **[Confirmed]** at ATO level ([ATO GST-free food](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/gst-and-food/gst-free-food), [ATO detailed food list](https://www.ato.gov.au/Business/GST/In-detail/Your-industry/Food/Detailed-food-list/)). The classification of **each product this roaster sells** (cold brew concentrate, drip bags, chai, syrups, cups, merch, equipment, servicing, freight) is **[Assumption — confirm with accountant]**.
- An invoice covering _only_ GST-free items is not legally a tax invoice. Whether to title it "Invoice" or "Tax Invoice" is **[Assumption — confirm with accountant]**.
- **Consolidated invoices:** one invoice covering several deliveries for a period (weekly or monthly), or several branches billed to head office. **[Common practice]**. The roaster's actual billing cadence is **[Assumption — confirm with roaster]**.
- GST rounding per line vs per invoice is **[Assumption — confirm with accountant]**. `CLAUDE.md` currently says per line.
- **Record keeping:** keep GST records, including tax invoices, for **5 years**. **[Confirmed]** ([ATO GST records](https://www.ato.gov.au/Business/Record-keeping-for-business/Detailed-business-record-keeping-requirements/Running-your-business---records/Business-activity-statement-records/GST-records/), [ATO keeping business records](https://www.ato.gov.au/aboriginal-and-torres-strait-islander-peoples/tax-for-businesses/keeping-business-records)). Issued invoices must therefore be immutable and retained. Changes go through credit or adjustment notes, not edits.

**Where Xero fits.** Most Australian small roasters keep the ledger, bank reconciliation, BAS and often invoicing itself in Xero (or MYOB/QuickBooks). Operations tools push invoices and contacts to Xero, and payments come back from Xero. Roast Console lists a Xero integration. RoasterTools lists Xero as "coming soon". Cropster lists ERP connectors (Dynamics 365, NetSuite) rather than Xero. **[Common practice]** ([RoasterTools pricing](https://roastertools.com/pricing), [Roast Console on Capterra](https://www.capterra.co.uk/software/1222107/Roast-Console), [RoasterTools tech stack](https://roastertools.com/blog/the-must-have-tech-stack-for-coffee-roasters)). Which accounting system this roaster uses, and which system is the source of truth for invoices and payments, is **[Assumption — confirm with roaster]**. This is the single biggest design decision. See the gap analysis.

## 11. Payments, credit notes and overdue follow-up

**Actors:** bookkeeper, account manager, owner.

- Payment is usually by bank transfer (EFT) against the invoice number, sometimes by direct debit or card. One remittance often pays **several invoices**. **[Common practice]**
- Terms are often 7, 14 or 30 days, or end-of-month. New accounts may be COD or prepaid. **[Common practice]** ([Sprintlaw terms of trade](https://sprintlaw.com.au/articles/coffee-roaster-terms-trade/))
- **Credit notes / adjustment notes:** used for short delivery, damaged bags, wrong coffee, price errors or returns. For a _taxable_ line, an **adjustment note** is generally needed before the GST decrease can be claimed. There is an exception where the GST adjustment is $75 or less. GST-free lines have no GST to adjust. **[Confirmed]** ([ATO adjustment notes](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/completing-your-bas-for-gst/making-adjustments-on-your-activity-statements/adjustment-notes))
- **Overdue follow-up:** reminders at due date, +7 and +14 days, monthly statements, and putting the account on **stop supply / credit hold**. Account managers need to see overdue status _before_ the next delivery goes out. **[Common practice]**. The roaster's own policy is **[Assumption — confirm with roaster]**.

## 12. Reporting

**Actors:** owner, bookkeeper, account manager.

| Report                                                         | Who          | Notes                                                                                                                                                  |
| -------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sales by customer / branch / product / period, in $ and **kg** | owner, sales | Kg per week per account matters for equipment-loan minimums and for pricing tiers. **[Common practice]**                                               |
| Account health: volume trend, last order date, lapsed accounts | sales        | **[Common practice]**                                                                                                                                  |
| Aged receivables (current, 30, 60, 90+)                        | bookkeeper   | Often taken from Xero instead. **[Assumption — confirm with roaster]**                                                                                 |
| Green stock on hand (kg per lot, value) and days of cover      | roaster      | **[Common practice]**                                                                                                                                  |
| Roast loss by lot / profile                                    | roaster      | Quality and cost control. **[Common practice]**                                                                                                        |
| COGS and margin per kg by product and customer                 | owner        | Needs landed green cost + yield + packaging. The method (weighted average vs FIFO, overhead allocation) is **[Assumption — confirm with accountant]**. |
| Production plan: kg to roast per coffee per roast day          | production   | Derived from the order book. **[Common practice]**                                                                                                     |
| GST summary for BAS                                            | bookkeeper   | Normally produced in Xero. The CRM should not duplicate this if Xero is the ledger. **[Assumption — confirm with roaster]**                            |

---

## 13. Actors summary

| Role                       | Main jobs in the system                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| Owner / head roaster       | green buying, pricing, roast planning, margin reports                     |
| Production / packing staff | roast batches, packing, pick lists, dispatch                              |
| Sales / account manager    | onboarding, price lists, standing orders, account health, overdue chasing |
| Bookkeeper                 | invoices, credit notes, payments, supplier bills, Xero sync               |
| Cafe customer (per branch) | places and changes orders, receives invoices and statements               |
| Driver / courier           | delivery and proof of delivery                                            |

## Sources

- ATO: [Tax invoices](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices), [GST-free food](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/gst-and-food/gst-free-food), [Detailed food list](https://www.ato.gov.au/Business/GST/In-detail/Your-industry/Food/Detailed-food-list/), [Adjustment notes](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/completing-your-bas-for-gst/making-adjustments-on-your-activity-statements/adjustment-notes), [GST records](https://www.ato.gov.au/Business/Record-keeping-for-business/Detailed-business-record-keeping-requirements/Running-your-business---records/Business-activity-statement-records/GST-records/)
- Xero AU: [Tax invoice requirements](https://www.xero.com/au/guides/tax-invoice-requirements/)
- FSANZ / legislation: [Food recalls](https://www.foodstandards.gov.au/business/food-recalls), [Standard 1.2.5 date marking](https://www.legislation.gov.au/F2015L00401/2021-06-03/2021-06-03/text/original/epub/OEBPS/document_1/document_1.html), [Country of origin food labelling](https://business.gov.au/products-and-services/product-labelling/country-of-origin-food-labelling)
- Importers: [Melbourne Coffee Merchants](https://melbournecoffeemerchants.com.au/how-to-order/), [Sucafina APAC](https://sucafina.com/apac/how-to-order)
- Roasting: [Barista Hustle](https://baristahustle.com/?p=453522), [Royal Coffee: roast yield](https://royalcoffee.com/understanding-roast-yield-and-loss/), [Green Coffee Collective: roast loss](https://greencoffeecollective.com/pages/glossary/roast-loss)
- Software: [Cropster production](https://www.cropster.com:443/solutions/production-manager/), [Cropster blueprint PDF](https://www.cropster.com/app/uploads/2026/04/No-More-Sunday-Night-Scramble-The-blueprint-for-linking-orders-to-roast-logs-and-scaling-without-the-stress-1.pdf), [RoasterTools](https://roastertools.com/pricing), [Roast Console](https://sprudge.com/roastconsole-launches-coffee-roasting-software-that-runs-the-whole-roastery-on-one-plan-1356622.html), [Upstock](https://upstock.app/for/coffee-roasters)
- Roaster practice: [Seven Miles wholesale pricing](https://www.sevenmiles.com.au/editorial/how-much-does-wholesale-coffee-cost/), [Merlo wholesale FAQ](https://www.merlo.com.au/pages/wholesale-faq), [Marketlane wholesale](https://marketlane.com.au/pages/wholesale), [Seven Seeds shipping](https://sevenseeds.com.au/pages/shipping-information), [Bean Scene: equipment](https://www.beanscenemag.com.au/a-guide-to-sourcing-the-right-coffee-making-equipment/), [Sprintlaw terms of trade](https://sprintlaw.com.au/articles/coffee-roaster-terms-trade/), [Sprintlaw supplier agreements](https://sprintlaw.com.au/articles/coffee-supplier-agreements-roasters/), [Mahalia: batch & best-before](https://mahaliacoffee.com.au/blogs/coffee-community-our-blog/best-before-and-roast-date)
