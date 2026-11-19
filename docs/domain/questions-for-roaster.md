# Questions for the roaster (and their accountant)

Owner: product-owner. Ask these in priority order. Each answer settles one or more items marked **[Assumption — confirm with roaster/accountant]** in `wholesale-roaster-flow.md`, or a severity in `schema-gap-analysis.md` (G-numbers).

The questions are in plain language so the developer can read them out as written. When you get an answer, record it in the relevant brief's **Decisions** section and update the domain docs.

---

## Part A: Roaster / owner

### Priority 1: ask before any more building

**Q1. Which accounting software do you use (Xero, MYOB, QuickBooks)? Who creates the invoices today, and where do you mark them paid?**
_Why it matters:_ this decides whether our system _issues_ invoices and tracks payments, or just sends orders to Xero and reads back whether they're paid. If Xero is the system of record, a large part of the invoicing, payments and supplier-bill work becomes a sync job, not a feature. (G6, G12, G13, G22)

**Q2. How do cafes order today: phone, text, email, web shop, or the same order every week? Roughly what share of your volume is a fixed weekly order? When a cafe wants to skip a week or change one delivery, how do they tell you?**
_Why it matters:_ standing orders and the "skip/change one occurrence" rules are the core of order entry. If most volume is standing orders, they come before ad-hoc ordering. (G3)

**Q3. Do different cafes pay different prices for the same coffee? How do you set them: per account, by volume tier (e.g. over 20 kg/week), or by a discount off a list price? How often do prices change, and do you give notice?**
_Why it matters:_ order entry has to pick up each account's own price automatically. Price changes over time affect what an order shows if it was placed before an increase. (G2)

**Q4. How do you bill: one invoice per delivery, or one per week or month? For groups with several cafes, does each venue get its own invoice or does head office get one combined invoice? Do any groups bill different venues to different companies?**
_Why it matters:_ this decides the invoice grouping rules and whether one company (ABN) can appear as more than one billed customer. (G6; `Customer.abn @unique`)

**Q5. Walk us through your range. Which coffees and blends do you sell? Roughly what share of volume is blends? Do blend recipes change when a coffee runs out? What bag sizes do you sell, and do any customers buy ground coffee? Do you describe roasts as light/medium/dark, or as espresso/filter? Anything else you sell: cold brew, chai, syrups, cups, equipment?**
_Why it matters:_ this shapes how one coffee relates to its bag sizes and grinds, whether we need blend recipes, and which product fields we need. (G1, G9, G26; `RoastLevel` enum)

**Q6. What days do you roast, and what days do you deliver to which areas? What's the order cut-off for each? Do you run your own van, use a courier, or both? What changes around public holidays and Christmas?**
_Why it matters:_ every order needs a roast day and a delivery day, and late orders roll forward. This is also the input for "how much do we roast tomorrow". (G4, G5, G18)

### Priority 2: needed for MVP details

**Q7. Do you have a minimum order (kg or $) or a delivery fee below a certain amount? Do you actually enforce it?**
_Why it matters:_ this decides whether order entry blocks or warns on small orders, and whether we need non-coffee charge lines such as freight. (G19, G20)

**Q8. What payment terms do you give (7 days, 14 days, end of month + 30, pay upfront)? Do you set credit limits? When do you stop supplying an account that hasn't paid, and who decides? How do you chase overdue invoices today?**
_Why it matters:_ the payment terms model, the account-hold flag, and whether staff see a warning before dispatch. The current default of 14 days is a guess. (G14, G15)

**Q9. When you're short of a coffee, what happens? Do you send part of the order, send a different coffee, or hold the whole order? Do you invoice what was ordered or what was actually delivered? How often does this happen?**
_Why it matters:_ this decides whether we need delivered and backordered quantities per line, and whether invoicing happens at dispatch. If it's frequent, this becomes a Must. (G17)

**Q10. Do you lend espresso machines or grinders to cafes? If yes, how many accounts have them? Is there a minimum kg per week? Do you service the equipment yourselves and charge for it?**
_Why it matters:_ an equipment-loan program needs an asset register, a kg/week commitment check and service jobs. If you don't do this, we drop it entirely. (G21)

**Q11. Do you use roasting software (Cropster, Artisan, RoastPATH, Roast Console, other)? Does it already track green stock and roast batches? Do you print a batch number or roast date on bags? If you had to recall a batch today, how would you find which cafes got it?**
_Why it matters:_ if another tool already does green stock and batches, we integrate or link rather than rebuild. Wholesale food businesses must have a written recall system. This tells us whether software traceability is a priority or just a nice-to-have. (G7, G8, G11)

### Priority 3: post-MVP

**Q12. Who do you buy green coffee from? Do you buy from stock already in the warehouse, commit ahead of time, or both? Do you work out a landed cost per kg including freight? How do you know when to reorder?**
_Why it matters:_ this decides how green purchasing, lots and landed cost work, and whether supplier bills need to link to them. (G7, G10)

**Q13. How often do you issue credits, and why (damaged bags, short delivery, wrong coffee, price mistakes)? Do cafes ever return coffee?**
_Why it matters:_ the credit note workflow, and how much effort it deserves. (G12)

**Q14. Who will use the system: you, production, sales, bookkeeper, drivers? Should cafes be able to log in and order or see invoices themselves?**
_Why it matters:_ roles and permissions, and whether a customer portal is in scope. (G28; `UserRole`)

**Q15. Which numbers do you look at every week? For example kg per account, lapsed accounts, margin per coffee, green stock left.**
_Why it matters:_ this sets the order of the reporting work. (G25)

**Q16. Do you also sell retail or online (Shopify, etc.) or to offices? Should those orders come into this system?**
_Why it matters:_ scope. Retail brings consumer GST-inclusive pricing, small bags and ground coffee.

**Q17. Where is your customer list and price list today (Xero contacts, spreadsheet, another system)? How many active accounts and venues do you have?**
_Why it matters:_ data migration and import, and the scale we need to support.

---

## Part B: Accountant

**A1. Please confirm the GST treatment for each item we sell or charge.** Whole bean coffee, ground coffee, decaf, drip/filter bags, cold brew concentrate, ready-to-drink coffee, chai/tea, syrups, chocolate, cups/merch, equipment sales, equipment rental, servicing/repairs, delivery/freight fees, minimum-order fees, barista training.
_Why it matters:_ each product and charge stores a tax code. A wrong code means wrong GST on every invoice. The ATO food list treats coffee beans and ground coffee as GST-free, but we will not classify any product without your sign-off. (Product tax codes; G19)

**A2. If an invoice contains only GST-free items, should it be titled "Tax Invoice" or just "Invoice"?**
_Why it matters:_ this decides the invoice template logic.

**A3. Should GST be rounded per line or on the invoice total?**
_Why it matters:_ the totals calculation. Our current rule rounds per line. Totals must match Xero to the cent.

**A4. Which system should own invoice and credit note numbering? Do our credit notes need to be formatted as ATO adjustment notes?**
_Why it matters:_ this avoids numbering clashes with Xero and settles the credit note content. (G12, G22)

**A5. How should stock be valued and cost of goods worked out (weighted average or FIFO for green coffee)? Should freight and import charges be included in green stock cost? Should packaging and labour be included?**
_Why it matters:_ this decides whether we track landed cost per lot and what the margin reports calculate. (G10, G25)

**A6. Is GST reported on a cash or accrual basis?**
_Why it matters:_ whether the invoice date or the payment date drives the GST reports we might produce. Likely none, if Xero does BAS.

**A7. Are loaned machines recorded as company assets? Does anything about them need to come from our system (serial numbers, location, install date)?**
_Why it matters:_ the scope of the equipment register, if one exists. (G21)

**A8. Beyond the ATO's 5-year rule for GST records, are there longer retention periods we should design for (e.g. company records)?**
_Why it matters:_ archive and deletion rules. Issued invoices must never be deleted.
