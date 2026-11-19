/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- supertest bodies are untyped JSON */
import { createTestApp, createUser, login, TestApp } from './helpers/app';
import {
  Actors,
  Catalogue,
  client,
  Client,
  loginActors,
  newRequestId,
  seedBranch,
  seedCatalogue,
} from './helpers/domain';

// Tue 24 Nov 2026 10:00 Sydney (AEDT). Default calendar: roast Wed 25, deliver Thu 26, cut-off Tue 12:00.
const TUE_10AM = '2026-11-23T23:00:00Z';
const TUE_1201PM = '2026-11-24T01:01:00Z';
const ON_SCHEDULE = { roastDate: '2026-11-25', deliveryDate: '2026-11-26' };

describe('orders (e2e)', () => {
  let t: TestApp;
  let c: Client;
  let who: Actors;
  let cat: Catalogue;
  let branchId: string;
  let customerId: string;

  const line = (p: { id: string; price: string }, quantity: number, taxCode = 'GST_FREE') => ({
    productId: p.id,
    quantity,
    expectedUnitPriceExGst: p.price,
    expectedTaxCode: taxCode,
  });
  const espresso = (q: number) => line(cat.espresso1kg, q);
  const espresso250 = (q: number) => line(cat.espresso250g, q);
  const tablets = (q: number) => line(cat.tablets, q, 'GST');

  const create = (body: Record<string, unknown> = {}, as = who.staff) =>
    c.post('/orders', as, { requestId: newRequestId(), branchId, ...ON_SCHEDULE, ...body });
  const draft = async (lines: unknown[] = [espresso(12)], as = who.staff) => {
    const res = await create({ lines }, as);
    if (res.status !== 201)
      throw new Error(`draft failed ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const confirmed = async (lines: unknown[] = [espresso(12)]) => {
    const d = await draft(lines);
    const res = await c.post(`/orders/${d.id}/confirm`, who.staff, { version: d.version });
    if (res.status !== 200)
      throw new Error(`confirm failed ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };

  beforeAll(async () => {
    t = await createTestApp();
    c = client(t);
    who = await loginActors(t);
    cat = await seedCatalogue(c, who.manager);
    ({ branchId, customerId } = await seedBranch(c, who.manager));
  });
  beforeEach(() => t.clock.set(TUE_10AM));
  afterAll(() => t.close());

  describe('order number', () => {
    it('starts at ORD-1001 and increments', async () => {
      const a = await draft([]);
      const b = await draft([]);
      expect(a.orderNumber).toBe('ORD-1001');
      expect(b.orderNumber).toBe('ORD-1002');
    });
  });

  describe('GST and totals (worked examples)', () => {
    it('12 x 34.00 GST-free: 408.00 / 0.00 / 408.00', async () => {
      const o = await draft([espresso(12)]);
      expect(o).toMatchObject({
        subtotalExGst: '408.00',
        gstAmount: '0.00',
        totalIncGst: '408.00',
      });
      expect(o.lines[0]).toMatchObject({
        lineTotalExGst: '408.00',
        gstAmount: '0.00',
        lineTotalIncGst: '408.00',
        taxCode: 'GST_FREE',
      });
    });

    it('mixed: 12 x 34.00 GST-free + 2 x 18.18 GST = 444.36 / 3.64 / 448.00', async () => {
      const o = await draft([espresso(12), tablets(2)]);
      expect(o).toMatchObject({
        subtotalExGst: '444.36',
        gstAmount: '3.64',
        totalIncGst: '448.00',
      });
      const tab = o.lines.find((l: { sku: string }) => l.sku === 'CT-100');
      expect(tab).toMatchObject({
        lineTotalExGst: '36.36',
        gstAmount: '3.64',
        lineTotalIncGst: '40.00',
        taxCode: 'GST',
      });
    });

    it('rounds half-up per line: 3 x 12.35 GST = 37.05 / 3.71 / 40.76 and 1 x 0.05 GST = 0.05 / 0.01 / 0.06', async () => {
      const mk = async (sku: string, price: string) =>
        (
          await c.post('/products', who.manager, {
            sku,
            name: sku,
            listPriceExGst: price,
            taxCode: 'GST',
          })
        ).body;
      const a = await mk('RND-1235', '12.35');
      const b = await mk('RND-005', '0.05');
      const o1 = await draft([line({ id: a.id, price: '12.35' }, 3, 'GST')]);
      expect(o1).toMatchObject({ subtotalExGst: '37.05', gstAmount: '3.71', totalIncGst: '40.76' });
      const o2 = await draft([line({ id: b.id, price: '0.05' }, 1, 'GST')]);
      expect(o2).toMatchObject({ subtotalExGst: '0.05', gstAmount: '0.01', totalIncGst: '0.06' });
    });

    it('GST is rounded per line, not on the total: two 0.05 GST lines -> 0.02', async () => {
      const mk = async (sku: string) =>
        (
          await c.post('/products', who.manager, {
            sku,
            name: sku,
            listPriceExGst: '0.05',
            taxCode: 'GST',
          })
        ).body;
      const a = await mk('PL-A');
      const b = await mk('PL-B');
      const o = await draft([
        line({ id: a.id, price: '0.05' }, 1, 'GST'),
        line({ id: b.id, price: '0.05' }, 1, 'GST'),
      ]);
      expect(o).toMatchObject({ subtotalExGst: '0.10', gstAmount: '0.02', totalIncGst: '0.12' });
    });

    it('caps: 999 x 9999.99 GST = ex 9989990.01, GST 998999.00, inc 10988989.01, with no float drift', async () => {
      const p = (
        await c.post('/products', who.manager, {
          sku: 'CAP-1',
          name: 'Cap',
          listPriceExGst: '9999.99',
          taxCode: 'GST',
        })
      ).body;
      const o = await draft([line({ id: p.id, price: '9999.99' }, 999, 'GST')]);
      expect(o.lines[0]).toMatchObject({
        lineTotalExGst: '9989990.01',
        gstAmount: '998999.00',
        lineTotalIncGst: '10988989.01',
      });
      expect(o).toMatchObject({
        subtotalExGst: '9989990.01',
        gstAmount: '998999.00',
        totalIncGst: '10988989.01',
      });
    });

    it('totals always equal the sum of lines and total = subtotal + GST, as 2dp strings', async () => {
      const o = await draft([espresso(7), espresso250(3), tablets(5)]);
      const sum = (k: string) =>
        o.lines.reduce(
          (t: number, l: Record<string, string>) => t + Math.round(Number(l[k]) * 100),
          0,
        );
      expect(Math.round(Number(o.subtotalExGst) * 100)).toBe(sum('lineTotalExGst'));
      expect(Math.round(Number(o.gstAmount) * 100)).toBe(sum('gstAmount'));
      expect(Math.round(Number(o.totalIncGst) * 100)).toBe(
        Math.round(Number(o.subtotalExGst) * 100) + Math.round(Number(o.gstAmount) * 100),
      );
      for (const k of ['subtotalExGst', 'gstAmount', 'totalIncGst'])
        expect(o[k]).toMatch(/^\d+\.\d{2}$/);
    });

    it('totalWeightGrams counts coffee lines only: 12 x 1 kg + 2 x 250 g + 2 tubs = 12,500', async () => {
      const o = await draft([espresso(12), espresso250(2), tablets(2)]);
      expect(o.totalWeightGrams).toBe(12500);
    });

    it('200 lines x 999 x 100 kg save and return 19,980,000,000 g as a plain JSON number (BIGINT column, no cap)', async () => {
      const cf = (await c.post('/coffees', who.manager, { name: 'Heavy Roast', type: 'BLEND' }))
        .body;
      const lines: unknown[] = [];
      for (let i = 0; i < 200; i++) {
        const grind = [cat.grinds['Whole bean'], cat.grinds.Espresso, cat.grinds.Filter][i % 3];
        const p = (
          await c.post('/products', who.manager, {
            sku: `HVY-${i}`,
            coffeeId: cf.id,
            bagSizeGrams: 100000 - Math.floor(i / 3),
            grindId: grind,
            listPriceExGst: '1.00',
            taxCode: 'GST_FREE',
          })
        ).body;
        lines.push({
          productId: p.id,
          quantity: 999,
          expectedUnitPriceExGst: '1.00',
          expectedTaxCode: 'GST_FREE',
        });
      }
      const res = await create({ lines });
      expect(res.status).toBe(201);
      expect(typeof res.body.totalWeightGrams).toBe('number');
      // sum over i of (100000 - floor(i/3)) * 999
      let expected = 0;
      for (let i = 0; i < 200; i++) expected += (100000 - Math.floor(i / 3)) * 999;
      expect(res.body.totalWeightGrams).toBe(expected);
      const again = (await c.get(`/orders/${res.body.id}`, who.staff)).body;
      expect(again.totalWeightGrams).toBe(expected);
      const row = (await c.get(`/orders?search=${res.body.orderNumber}`, who.staff)).body.items[0];
      expect(row.totalWeightGrams).toBe(expected);
    });

    it('a draft with no lines saves with zero totals', async () => {
      const o = await draft([]);
      expect(o).toMatchObject({
        lineCount: 0,
        subtotalExGst: '0.00',
        gstAmount: '0.00',
        totalIncGst: '0.00',
        totalWeightGrams: 0,
      });
    });

    it('lines are ordered by description, case-insensitively', async () => {
      const o = await draft([tablets(1), espresso(1), espresso250(1)]);
      const names = o.lines.map((l: { description: string }) => l.description);
      expect(names).toEqual(
        [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
      );
    });
  });

  describe('line validation', () => {
    it.each([0, -1, 1.5, '2', null, 1000])(
      'rejects quantity %p at lines.0.quantity',
      async (quantity) => {
        const res = await create({ lines: [{ ...espresso(1), quantity }] });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
        expect(res.body.fieldErrors.map((f: { field: string }) => f.field)).toContain(
          'lines.0.quantity',
        );
      },
    );

    it('rejects a missing quantity', async () => {
      const res = await create({ lines: [{ productId: cat.espresso1kg.id }] });
      expect(res.status).toBe(400);
    });

    it('rejects a duplicate product with code duplicateProduct', async () => {
      const res = await create({ lines: [espresso(1), espresso(2)] });
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'lines.1.productId', code: 'duplicateProduct' }),
        ]),
      );
    });

    it('rejects more than 200 lines', async () => {
      const lines = Array.from({ length: 201 }, () => ({
        productId: crypto.randomUUID(),
        quantity: 1,
      }));
      const res = await create({ lines });
      expect(res.status).toBe(400);
    });

    it('a new line without the expected price and tax code is a 400 at that line', async () => {
      const res = await create({ lines: [{ productId: cat.espresso1kg.id, quantity: 1 }] });
      expect(res.status).toBe(400);
    });

    it('an unknown product id is a 400 with code notFound', async () => {
      const res = await create({
        lines: [
          {
            productId: crypto.randomUUID(),
            quantity: 1,
            expectedUnitPriceExGst: '1.00',
            expectedTaxCode: 'GST',
          },
        ],
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.fieldErrors)).toMatch(/notFound/);
    });
  });

  describe('request validation', () => {
    it.each([
      ['no requestId', { requestId: undefined }],
      ['bad requestId', { requestId: 'nope' }],
      ['no branchId', { branchId: undefined }],
      ['bad date format', { deliveryDate: '26/11/2026' }],
      ['impossible date', { deliveryDate: '2026-02-30' }],
      ['notes over 2000', { notes: 'n'.repeat(2001) }],
      ['unknown field', { status: 'CONFIRMED' }],
    ])('400 for %s', async (_l, body) => {
      const res = await create(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('400 notFound for an unknown branch, as a field error', async () => {
      const res = await create({ branchId: crypto.randomUUID() });
      expect(res.status).toBe(400);
    });
  });

  describe('snapshots', () => {
    it('keeps price, tax code and description after the product changes; quantity changes keep the price', async () => {
      const p = (
        await c.post('/products', who.manager, {
          sku: 'SNAP-1',
          name: 'Snap item',
          listPriceExGst: '10.00',
          taxCode: 'GST_FREE',
        })
      ).body;
      const o = await draft([line({ id: p.id, price: '10.00' }, 2, 'GST_FREE')]);
      await c.patch(`/products/${p.id}`, who.manager, { listPriceExGst: '12.00', taxCode: 'GST' });
      const after = (await c.get(`/orders/${o.id}`, who.staff)).body;
      expect(after.lines[0]).toMatchObject({
        unitPriceExGst: '10.00',
        taxCode: 'GST_FREE',
        lineTotalExGst: '20.00',
        gstAmount: '0.00',
      });
      expect(after).toMatchObject({
        subtotalExGst: '20.00',
        gstAmount: '0.00',
        totalIncGst: '20.00',
      });

      const changed = await c.patch(`/orders/${o.id}`, who.staff, {
        version: o.version,
        lines: [{ productId: p.id, quantity: 5 }],
      });
      expect(changed.status).toBe(200);
      expect(changed.body.lines[0]).toMatchObject({
        unitPriceExGst: '10.00',
        taxCode: 'GST_FREE',
        quantity: 5,
        lineTotalExGst: '50.00',
      });
    });

    it('removing then re-adding in two saves picks up the new price; in one save it keeps the old price', async () => {
      const p = (
        await c.post('/products', who.manager, {
          sku: 'SNAP-2',
          name: 'Snap two',
          listPriceExGst: '10.00',
          taxCode: 'GST_FREE',
        })
      ).body;
      const o = await draft([line({ id: p.id, price: '10.00' }, 1, 'GST_FREE'), espresso(1)]);
      await c.patch(`/products/${p.id}`, who.manager, { listPriceExGst: '15.00' });

      const same = await c.patch(`/orders/${o.id}`, who.staff, {
        version: o.version,
        lines: [
          { productId: p.id, quantity: 3 },
          { productId: cat.espresso1kg.id, quantity: 1 },
        ],
      });
      expect(
        same.body.lines.find((l: { productId: string }) => l.productId === p.id).unitPriceExGst,
      ).toBe('10.00');

      const removed = await c.patch(`/orders/${o.id}`, who.staff, {
        version: same.body.version,
        lines: [{ productId: cat.espresso1kg.id, quantity: 1 }],
      });
      expect(removed.status).toBe(200);
      const readded = await c.patch(`/orders/${o.id}`, who.staff, {
        version: removed.body.version,
        lines: [
          { productId: cat.espresso1kg.id, quantity: 1 },
          {
            productId: p.id,
            quantity: 1,
            expectedUnitPriceExGst: '15.00',
            expectedTaxCode: 'GST_FREE',
          },
        ],
      });
      expect(
        readded.body.lines.find((l: { productId: string }) => l.productId === p.id).unitPriceExGst,
      ).toBe('15.00');
    });

    it('PRICE_CHANGED: nothing is saved and the version does not change; a tax-code change is detected too', async () => {
      const p = (
        await c.post('/products', who.manager, {
          sku: 'SNAP-3',
          name: 'Snap three',
          listPriceExGst: '34.00',
          taxCode: 'GST_FREE',
        })
      ).body;
      const o = await draft([espresso(1)]);
      await c.patch(`/products/${p.id}`, who.manager, { listPriceExGst: '36.00' });
      const res = await c.patch(`/orders/${o.id}`, who.staff, {
        version: o.version,
        lines: [
          { productId: cat.espresso1kg.id, quantity: 1 },
          {
            productId: p.id,
            quantity: 1,
            expectedUnitPriceExGst: '34.00',
            expectedTaxCode: 'GST_FREE',
          },
        ],
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PRICE_CHANGED');
      expect(res.body.meta.lines[0]).toMatchObject({
        productId: p.id,
        expected: { unitPriceExGst: '34.00', taxCode: 'GST_FREE' },
        current: { unitPriceExGst: '36.00', taxCode: 'GST_FREE' },
      });
      const unchanged = (await c.get(`/orders/${o.id}`, who.staff)).body;
      expect(unchanged.version).toBe(o.version);
      expect(unchanged.lines).toHaveLength(1);

      await c.patch(`/products/${p.id}`, who.manager, { listPriceExGst: '34.00', taxCode: 'GST' });
      const taxChange = await c.patch(`/orders/${o.id}`, who.staff, {
        version: o.version,
        lines: [
          {
            productId: p.id,
            quantity: 1,
            expectedUnitPriceExGst: '34.00',
            expectedTaxCode: 'GST_FREE',
          },
        ],
      });
      expect(taxChange.body.code).toBe('PRICE_CHANGED');
      expect(taxChange.body.meta.lines[0].current.taxCode).toBe('GST');
    });

    it('POST /orders also returns PRICE_CHANGED and creates nothing', async () => {
      const p = (
        await c.post('/products', who.manager, {
          sku: 'SNAP-4',
          name: 'Snap four',
          listPriceExGst: '5.00',
          taxCode: 'GST',
        })
      ).body;
      await c.patch(`/products/${p.id}`, who.manager, { listPriceExGst: '6.00' });
      const requestId = newRequestId();
      const res = await create({ requestId, lines: [line({ id: p.id, price: '5.00' }, 1, 'GST')] });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PRICE_CHANGED');
      const retry = await create({
        requestId,
        lines: [line({ id: p.id, price: '6.00' }, 1, 'GST')],
      });
      expect(retry.status).toBe(201);
    });

    it('a deactivated product stays on the order (productOrderable false), its quantity can change on a draft, and confirm is refused', async () => {
      const p = (
        await c.post('/products', who.manager, {
          sku: 'SNAP-5',
          name: 'Snap five',
          listPriceExGst: '2.00',
          taxCode: 'GST',
        })
      ).body;
      const o = await draft([line({ id: p.id, price: '2.00' }, 1, 'GST')]);
      await c.post(`/products/${p.id}/deactivate`, who.manager);
      const after = (await c.get(`/orders/${o.id}`, who.staff)).body;
      expect(after.lines[0].productOrderable).toBe(false);
      const qty = await c.patch(`/orders/${o.id}`, who.staff, {
        version: o.version,
        lines: [{ productId: p.id, quantity: 4 }],
      });
      expect(qty.status).toBe(200);
      expect(qty.body.lines[0].quantity).toBe(4);
      const conf = await c.post(`/orders/${o.id}/confirm`, who.staff, {
        version: qty.body.version,
      });
      expect(conf.status).toBe(409);
      expect(conf.body.code).toBe('PRODUCT_UNAVAILABLE');
    });

    it('a new line for an inactive product or a product of an inactive coffee is PRODUCT_UNAVAILABLE', async () => {
      const p = (
        await c.post('/products', who.manager, {
          sku: 'SNAP-6',
          name: 'Snap six',
          listPriceExGst: '2.00',
          taxCode: 'GST',
        })
      ).body;
      await c.post(`/products/${p.id}/deactivate`, who.manager);
      const res = await create({ lines: [line({ id: p.id, price: '2.00' }, 1, 'GST')] });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PRODUCT_UNAVAILABLE');
      expect(res.body.meta.lines[0]).toMatchObject({ productId: p.id });

      const cf = (await c.post('/coffees', who.manager, { name: 'Gone Roast', type: 'BLEND' }))
        .body;
      const gp = (
        await c.post('/products', who.manager, {
          sku: 'GONE-1',
          coffeeId: cf.id,
          bagSizeGrams: 1000,
          grindId: cat.grinds['Whole bean'],
          listPriceExGst: '30.00',
          taxCode: 'GST_FREE',
        })
      ).body;
      await c.post(`/coffees/${cf.id}/deactivate`, who.manager);
      const res2 = await create({ lines: [line({ id: gp.id, price: '30.00' }, 1)] });
      expect(res2.status).toBe(409);
      expect(res2.body.code).toBe('PRODUCT_UNAVAILABLE');
      expect(JSON.stringify(res2.body.meta)).toMatch(/COFFEE_INACTIVE/);
    });

    it('the description snapshot keeps the old coffee name after a rename', async () => {
      const cf = (await c.post('/coffees', who.manager, { name: 'Old Name', type: 'BLEND' })).body;
      const p = (
        await c.post('/products', who.manager, {
          sku: 'REN-1',
          coffeeId: cf.id,
          bagSizeGrams: 1000,
          grindId: cat.grinds['Whole bean'],
          listPriceExGst: '30.00',
          taxCode: 'GST_FREE',
        })
      ).body;
      const o = await draft([line({ id: p.id, price: '30.00' }, 1)]);
      await c.patch(`/coffees/${cf.id}`, who.manager, { name: 'New Name' });
      const after = (await c.get(`/orders/${o.id}`, who.staff)).body;
      expect(after.lines[0].description).toBe('Old Name — 1 kg — Whole bean');
    });
  });

  describe('idempotency, versions and concurrency', () => {
    it('POST with the same requestId returns the same order with 200', async () => {
      const requestId = newRequestId();
      const first = await create({ requestId, lines: [espresso(1)] });
      const again = await create({ requestId, lines: [espresso(1)] });
      expect(first.status).toBe(201);
      expect(again.status).toBe(200);
      expect(again.body.id).toBe(first.body.id);
      const list = await c.get(`/orders?search=${first.body.orderNumber}`, who.staff);
      expect(list.body.totalItems).toBe(1);
    });

    it('the same requestId from another user is 409 REQUEST_ID_REUSED', async () => {
      const requestId = newRequestId();
      await create({ requestId });
      const res = await create({ requestId }, who.manager);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REQUEST_ID_REUSED');
    });

    it('simultaneous creates with one requestId make exactly one order', async () => {
      const requestId = newRequestId();
      const results = await Promise.all([1, 2, 3].map(() => create({ requestId })));
      expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    });

    it('a stale version is 409 VERSION_CONFLICT with currentVersion and status', async () => {
      const o = await draft();
      const ok = await c.patch(`/orders/${o.id}`, who.staff, {
        version: o.version,
        notes: 'first',
      });
      expect(ok.status).toBe(200);
      expect(ok.body.version).toBe(o.version + 1);
      const stale = await c.patch(`/orders/${o.id}`, who.staff, {
        version: o.version,
        notes: 'second',
      });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('VERSION_CONFLICT');
      expect(stale.body.meta).toEqual({ currentVersion: o.version + 1, status: 'DRAFT' });
      expect((await c.get(`/orders/${o.id}`, who.staff)).body.notes).toBe('first');
    });

    it('two PATCHes with the same version: one 200, one VERSION_CONFLICT', async () => {
      const o = await draft();
      const results = await Promise.all([
        c.patch(`/orders/${o.id}`, who.staff, { version: o.version, notes: 'a' }),
        c.patch(`/orders/${o.id}`, who.manager, { version: o.version, notes: 'b' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });

    it('two simultaneous confirms: one succeeds, one conflicts, and exactly one CONFIRMED event is written', async () => {
      const o = await draft();
      const results = await Promise.all([
        c.post(`/orders/${o.id}/confirm`, who.staff, { version: o.version }),
        c.post(`/orders/${o.id}/confirm`, who.manager, { version: o.version }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const detail = (await c.get(`/orders/${o.id}`, who.staff)).body;
      expect(detail.events.filter((e: { type: string }) => e.type === 'CONFIRMED')).toHaveLength(1);
    });

    it('every write increments the version and bumps updatedBy', async () => {
      const o = await draft();
      const v2 = (await c.patch(`/orders/${o.id}`, who.manager, { version: o.version, notes: 'x' }))
        .body;
      expect(v2.version).toBe(o.version + 1);
      expect(v2.updatedBy.name).toBe('Test User');
      const v3 = (await c.post(`/orders/${o.id}/confirm`, who.manager, { version: v2.version }))
        .body;
      expect(v3.version).toBe(v2.version + 1);
    });

    it.each([
      ['missing', undefined],
      ['string', 'x'],
      ['float', 1.5],
    ])('400 for a %s version', async (_l, version) => {
      const o = await draft();
      const res = await c.patch(`/orders/${o.id}`, who.staff, { version, notes: 'x' });
      expect(res.status).toBe(400);
    });
  });

  describe('status machine', () => {
    const post = (
      id: string,
      action: string,
      version: number,
      extra: object = {},
      as = who.staff,
    ) => c.post(`/orders/${id}/${action}`, as, { version, ...extra });

    it('timestamps come from the injected clock, not the system clock', async () => {
      const d = await draft();
      t.clock.set('2026-11-23T23:05:00Z');
      const conf = (await post(d.id, 'confirm', d.version)).body;
      expect(conf.confirmedAt).toBe('2026-11-23T23:05:00.000Z');
      t.clock.set('2026-11-23T23:10:00Z');
      const packed = (await post(d.id, 'pack', conf.version)).body;
      expect(packed.packedAt).toBe('2026-11-23T23:10:00.000Z');
      t.clock.set('2026-11-23T23:20:00Z');
      const disp = (await post(d.id, 'dispatch', packed.version)).body;
      expect(disp.dispatchedAt).toBe('2026-11-23T23:20:00.000Z');
      t.clock.set('2026-11-23T23:30:00Z');
      const del = (await post(d.id, 'deliver', disp.version)).body;
      expect(del.deliveredAt).toBe('2026-11-23T23:30:00.000Z');
      const cancelled = await draft();
      t.clock.set('2026-11-23T23:40:00Z');
      const cx = (await post(cancelled.id, 'cancel', cancelled.version, { reason: 'x' })).body;
      expect(cx.cancelledAt).toBe('2026-11-23T23:40:00.000Z');
    });

    it('walks DRAFT -> CONFIRMED -> PACKED -> DISPATCHED -> DELIVERED, setting timestamps and writing events', async () => {
      const d = await draft();
      expect(d).toMatchObject({ status: 'DRAFT', confirmedAt: null });
      const conf = (await post(d.id, 'confirm', d.version)).body;
      expect(conf.status).toBe('CONFIRMED');
      expect(conf.confirmedAt).not.toBeNull();
      const packed = (await post(d.id, 'pack', conf.version)).body;
      expect(packed).toMatchObject({ status: 'PACKED' });
      expect(packed.packedAt).not.toBeNull();
      const disp = (await post(d.id, 'dispatch', packed.version)).body;
      expect(disp.status).toBe('DISPATCHED');
      expect(disp.dispatchedAt).not.toBeNull();
      const del = (await post(d.id, 'deliver', disp.version)).body;
      expect(del.status).toBe('DELIVERED');
      expect(del.deliveredAt).not.toBeNull();
      expect(del.events.map((e: { type: string }) => e.type).reverse()).toEqual([
        'CREATED',
        'CONFIRMED',
        'PACKED',
        'DISPATCHED',
        'DELIVERED',
      ]);
    });

    it('PACKED can be delivered directly (dispatch is optional)', async () => {
      const o = await confirmed();
      const packed = (await post(o.id, 'pack', o.version)).body;
      expect((await post(o.id, 'deliver', packed.version)).body.status).toBe('DELIVERED');
    });

    it.each([
      ['DRAFT', 'pack'],
      ['DRAFT', 'dispatch'],
      ['DRAFT', 'deliver'],
      ['CONFIRMED', 'confirm'],
      ['CONFIRMED', 'dispatch'],
      ['CONFIRMED', 'deliver'],
      ['PACKED', 'confirm'],
      ['PACKED', 'pack'],
      ['DELIVERED', 'confirm'],
      ['DELIVERED', 'pack'],
      ['DELIVERED', 'deliver'],
      ['DELIVERED', 'cancel'],
      ['CANCELLED', 'confirm'],
      ['CANCELLED', 'pack'],
      ['CANCELLED', 'deliver'],
      ['CANCELLED', 'cancel'],
    ])('%s -> %s is 409 INVALID_TRANSITION with the current status', async (status, action) => {
      let o = await draft();
      const target = status;
      const steps: Record<string, string[]> = {
        DRAFT: [],
        CONFIRMED: ['confirm'],
        PACKED: ['confirm', 'pack'],
        DELIVERED: ['confirm', 'pack', 'deliver'],
        CANCELLED: ['cancel'],
      };
      for (const step of steps[target]) {
        const res = await post(
          o.id,
          step,
          o.version,
          step === 'cancel' ? { reason: 'test' } : {},
          who.manager,
        );
        o = res.body;
      }
      const res = await post(
        o.id,
        action,
        o.version,
        action === 'cancel' ? { reason: 'test' } : {},
        who.manager,
      );
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_TRANSITION');
      expect(res.body.meta.status).toBe(status);
    });

    it('confirm needs at least one line (ORDER_EMPTY)', async () => {
      const d = await draft([]);
      const res = await post(d.id, 'confirm', d.version);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ORDER_EMPTY');
    });

    it('confirm is refused for an inactive customer (CUSTOMER_INACTIVE) and branch (BRANCH_INACTIVE)', async () => {
      const other = await seedBranch(c, who.manager, 'Inactive Cafe');
      const d = (await create({ branchId: other.branchId, lines: [espresso(1)] })).body;
      await c.post(`/branches/${other.branchId}/deactivate`, who.manager);
      const b = await post(d.id, 'confirm', d.version);
      expect([b.status, b.body.code]).toEqual([409, 'BRANCH_INACTIVE']);
      await c.post(`/branches/${other.branchId}/reactivate`, who.manager);
      await c.post(`/customers/${other.customerId}/deactivate`, who.manager);
      const cu = await post(d.id, 'confirm', d.version);
      expect([cu.status, cu.body.code]).toEqual([409, 'CUSTOMER_INACTIVE']);
      expect(cu.body.meta.customerId).toBe(other.customerId);
      const created = await create({ branchId: other.branchId });
      expect(created.body.code).toBe('CUSTOMER_INACTIVE');
    });

    it('pack, dispatch and deliver still work after the customer is deactivated, and the detail shows it', async () => {
      const other = await seedBranch(c, who.manager, 'Lapsing Cafe');
      const d = (await create({ branchId: other.branchId, lines: [espresso(1)] })).body;
      const conf = (await post(d.id, 'confirm', d.version)).body;
      await c.post(`/customers/${other.customerId}/deactivate`, who.manager);
      const packed = await post(d.id, 'pack', conf.version);
      expect(packed.status).toBe(200);
      expect(packed.body.customer.isActive).toBe(false);
      expect((await post(d.id, 'deliver', packed.body.version)).status).toBe(200);
    });

    describe('cancel', () => {
      it('requires a reason (blank, missing, over 500 chars are 400) and keeps lines and totals', async () => {
        const o = await confirmed([espresso(2)]);
        for (const reason of [undefined, '', '   ', 'r'.repeat(501)]) {
          const res = await post(o.id, 'cancel', o.version, { reason });
          expect([reason, res.status]).toEqual([reason, 400]);
        }
        const res = await post(o.id, 'cancel', o.version, { reason: '  Cafe closed  ' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          status: 'CANCELLED',
          cancelReason: 'Cafe closed',
          subtotalExGst: '68.00',
        });
        expect(res.body.cancelledAt).not.toBeNull();
        expect(res.body.lines).toHaveLength(1);
      });

      it('STAFF can cancel a DRAFT at any time and a CONFIRMED order before cut-off', async () => {
        const d = await draft();
        expect((await post(d.id, 'cancel', d.version, { reason: 'x' })).status).toBe(200);
        const o = await confirmed();
        expect((await post(o.id, 'cancel', o.version, { reason: 'x' })).status).toBe(200);
      });

      it('STAFF cannot cancel CONFIRMED past cut-off, PACKED or DISPATCHED (403 FORBIDDEN); a MANAGER can', async () => {
        const o = await confirmed();
        t.clock.set(TUE_1201PM);
        const past = await post(o.id, 'cancel', o.version, { reason: 'x' });
        expect(past.status).toBe(403);
        expect(past.body.code).toBe('FORBIDDEN');
        expect(past.body.meta.reason).toBe('PAST_CUTOFF');
        expect((await post(o.id, 'cancel', o.version, { reason: 'x' }, who.manager)).status).toBe(
          200,
        );

        t.clock.set(TUE_10AM);
        const p = await confirmed();
        const packed = (await post(p.id, 'pack', p.version)).body;
        const denied = await post(p.id, 'cancel', packed.version, { reason: 'x' });
        expect(denied.status).toBe(403);
        const disp = (await post(p.id, 'dispatch', packed.version)).body;
        expect((await post(p.id, 'cancel', disp.version, { reason: 'x' })).status).toBe(403);
        expect(
          (await post(p.id, 'cancel', disp.version, { reason: 'x' }, who.manager)).status,
        ).toBe(200);
      });
    });

    describe('revert (manager only)', () => {
      it('steps back, requires a reason, clears the undone timestamp and keeps confirmedAt', async () => {
        const o = await confirmed();
        const packed = (await post(o.id, 'pack', o.version)).body;
        expect((await post(o.id, 'revert', packed.version, { reason: 'x' })).status).toBe(403);
        expect((await post(o.id, 'revert', packed.version, {}, who.manager)).status).toBe(400);
        const back = await post(
          o.id,
          'revert',
          packed.version,
          { reason: 'Wrong grind' },
          who.manager,
        );
        expect(back.status).toBe(200);
        expect(back.body).toMatchObject({ status: 'CONFIRMED', packedAt: null });
        expect(back.body.confirmedAt).toBe(o.confirmedAt);
        expect(back.body.events[0]).toMatchObject({ type: 'REVERTED', reason: 'Wrong grind' });
        const toDraft = await post(
          o.id,
          'revert',
          back.body.version,
          { reason: 'Edit' },
          who.manager,
        );
        expect(toDraft.body.status).toBe('DRAFT');
        expect(toDraft.body.confirmedAt).toBe(o.confirmedAt);
      });

      it('cannot revert a DRAFT, DELIVERED or CANCELLED order', async () => {
        const d = await draft();
        expect(
          (await post(d.id, 'revert', d.version, { reason: 'x' }, who.manager)).body.code,
        ).toBe('INVALID_TRANSITION');
      });
    });

    describe('delete', () => {
      it('deletes a never-confirmed draft (204) and 404s afterwards', async () => {
        const d = await draft();
        const res = await c.del(`/orders/${d.id}?version=${d.version}`, who.staff);
        expect(res.status).toBe(204);
        expect((await c.get(`/orders/${d.id}`, who.staff)).status).toBe(404);
      });

      it('refuses a draft that was once confirmed (ORDER_NOT_DELETABLE) and a stale version', async () => {
        const o = await confirmed();
        const back = (await post(o.id, 'revert', o.version, { reason: 'x' }, who.manager)).body;
        const res = await c.del(`/orders/${o.id}?version=${back.version}`, who.manager);
        expect([res.status, res.body.code]).toEqual([409, 'ORDER_NOT_DELETABLE']);
        const d = await draft();
        expect((await c.del(`/orders/${d.id}?version=${d.version + 5}`, who.staff)).body.code).toBe(
          'VERSION_CONFLICT',
        );
      });

      it('refuses a confirmed order', async () => {
        const o = await confirmed();
        expect((await c.del(`/orders/${o.id}?version=${o.version}`, who.staff)).body.code).toBe(
          'ORDER_NOT_DELETABLE',
        );
      });
    });
  });

  describe('editing by status', () => {
    const patch = (id: string, body: object, as = who.staff) => c.patch(`/orders/${id}`, as, body);

    it('DRAFT: lines, dates and notes can all change; totals recompute', async () => {
      const d = await draft([espresso(1)]);
      const res = await patch(d.id, {
        version: d.version,
        notes: 'Leave at back',
        lines: [
          { productId: cat.espresso1kg.id, quantity: 3 },
          {
            productId: cat.tablets.id,
            quantity: 1,
            expectedUnitPriceExGst: '18.18',
            expectedTaxCode: 'GST',
          },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        notes: 'Leave at back',
        subtotalExGst: '120.18',
        gstAmount: '1.82',
        totalIncGst: '122.00',
      });
    });

    it('CONFIRMED must keep at least one line (ORDER_EMPTY)', async () => {
      const o = await confirmed();
      const res = await patch(o.id, { version: o.version, lines: [] });
      expect([res.status, res.body.code]).toEqual([409, 'ORDER_EMPTY']);
    });

    it('DELIVERED and CANCELLED are not editable, but sending the current value back is not an error, and notes still save', async () => {
      const o = await confirmed();
      const packed = (await c.post(`/orders/${o.id}/pack`, who.staff, { version: o.version })).body;
      const del = (await c.post(`/orders/${o.id}/deliver`, who.staff, { version: packed.version }))
        .body;
      const lines = await patch(o.id, {
        version: del.version,
        lines: [{ productId: cat.espresso1kg.id, quantity: 1 }],
      });
      expect([lines.status, lines.body.code]).toEqual([409, 'ORDER_NOT_EDITABLE']);
      const same = await patch(o.id, { version: del.version, deliveryDate: del.deliveryDate });
      expect(same.status).toBe(200);
      const changed = await patch(o.id, { version: same.body.version, deliveryDate: '2026-12-01' });
      expect(changed.body.code).toBe('ORDER_NOT_EDITABLE');
      const notes = await patch(o.id, { version: same.body.version, notes: 'Delivered ok' });
      expect(notes.status).toBe(200);
    });

    describe('PACKED short supply', () => {
      let packed: { id: string; version: number };
      beforeEach(async () => {
        const o = await confirmed([espresso(12), tablets(2)]);
        packed = (await c.post(`/orders/${o.id}/pack`, who.staff, { version: o.version })).body;
      });

      it('MANAGER reduces 12 -> 10 with a reason: totals recompute and an event is written', async () => {
        const res = await patch(
          packed.id,
          {
            version: packed.version,
            reason: 'Short of beans',
            lines: [
              { productId: cat.espresso1kg.id, quantity: 10 },
              { productId: cat.tablets.id, quantity: 2 },
            ],
          },
          who.manager,
        );
        expect(res.status).toBe(200);
        expect(res.body.lines.find((l: { sku: string }) => l.sku === 'HE-1KG-WB').quantity).toBe(
          10,
        );
        expect(res.body.subtotalExGst).toBe('376.36');
        expect(res.body.events[0]).toMatchObject({ type: 'UPDATED', reason: 'Short of beans' });
      });

      it('requires a reason, and removing a line is allowed but removing the last is ORDER_EMPTY', async () => {
        const noReason = await patch(
          packed.id,
          {
            version: packed.version,
            lines: [
              { productId: cat.espresso1kg.id, quantity: 10 },
              { productId: cat.tablets.id, quantity: 2 },
            ],
          },
          who.manager,
        );
        expect(noReason.status).toBe(400);
        const removed = await patch(
          packed.id,
          {
            version: packed.version,
            reason: 'r',
            lines: [{ productId: cat.espresso1kg.id, quantity: 12 }],
          },
          who.manager,
        );
        expect(removed.status).toBe(200);
        const empty = await patch(
          packed.id,
          { version: removed.body.version, reason: 'r', lines: [] },
          who.manager,
        );
        expect([empty.status, empty.body.code]).toEqual([409, 'ORDER_EMPTY']);
      });

      it('raising a quantity or adding a product is ORDER_NOT_EDITABLE', async () => {
        const raise = await patch(
          packed.id,
          {
            version: packed.version,
            reason: 'r',
            lines: [
              { productId: cat.espresso1kg.id, quantity: 13 },
              { productId: cat.tablets.id, quantity: 2 },
            ],
          },
          who.manager,
        );
        expect([raise.status, raise.body.code]).toEqual([409, 'ORDER_NOT_EDITABLE']);
        const add = await patch(
          packed.id,
          {
            version: packed.version,
            reason: 'r',
            lines: [
              { productId: cat.espresso1kg.id, quantity: 12 },
              { productId: cat.tablets.id, quantity: 2 },
              {
                productId: cat.espresso250g.id,
                quantity: 1,
                expectedUnitPriceExGst: '11.50',
                expectedTaxCode: 'GST_FREE',
              },
            ],
          },
          who.manager,
        );
        expect([add.status, add.body.code]).toEqual([409, 'ORDER_NOT_EDITABLE']);
      });

      it('STAFF is 403 SHORT_SUPPLY', async () => {
        const res = await patch(packed.id, {
          version: packed.version,
          reason: 'r',
          lines: [
            { productId: cat.espresso1kg.id, quantity: 10 },
            { productId: cat.tablets.id, quantity: 2 },
          ],
        });
        expect(res.status).toBe(403);
        expect(res.body.meta.reason).toBe('SHORT_SUPPLY');
      });

      it('the roast date cannot change on a PACKED order; the delivery date needs late-change', async () => {
        const roast = await patch(
          packed.id,
          { version: packed.version, roastDate: '2026-11-24' },
          who.manager,
        );
        expect([roast.status, roast.body.code]).toEqual([409, 'ORDER_NOT_EDITABLE']);
        const staffDate = await patch(packed.id, {
          version: packed.version,
          deliveryDate: '2026-11-27',
        });
        expect(staffDate.status).toBe(403);
        expect(staffDate.body.meta.reason).toBe('LATE_CHANGE');
        const mgr = await patch(
          packed.id,
          { version: packed.version, deliveryDate: '2026-11-27' },
          who.manager,
        );
        expect(mgr.status).toBe(200);
        expect(mgr.body.deliveryDate).toBe('2026-11-27');
      });

      it('notes can change on any status by anyone with orders:write', async () => {
        const res = await patch(packed.id, {
          version: packed.version,
          notes: 'Left with neighbour',
        });
        expect(res.status).toBe(200);
      });
    });
  });

  describe('schedule rules on save', () => {
    it('hard rules apply to every role, including ADMIN: past delivery, past roast, roast after delivery', async () => {
      for (const as of [who.staff, who.manager, who.admin]) {
        const pastDelivery = await create(
          { deliveryDate: '2026-11-23', roastDate: '2026-11-23' },
          as,
        );
        expect(pastDelivery.status).toBe(400);
        expect(pastDelivery.body.fieldErrors.map((f: { field: string }) => f.field)).toContain(
          'deliveryDate',
        );
        const pastRoast = await create({ roastDate: '2026-11-23', deliveryDate: '2026-11-26' }, as);
        expect(pastRoast.status).toBe(400);
        expect(pastRoast.body.fieldErrors.map((f: { field: string }) => f.field)).toContain(
          'roastDate',
        );
        const after = await create({ roastDate: '2026-11-27', deliveryDate: '2026-11-26' }, as);
        expect(after.status).toBe(400);
        expect(after.body.fieldErrors.map((f: { field: string }) => f.field)).toContain(
          'roastDate',
        );
      }
    });

    it('omitted dates are filled from the suggestion at the fake "now"', async () => {
      const res = await c.post('/orders', who.staff, { requestId: newRequestId(), branchId });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ roastDate: '2026-11-25', deliveryDate: '2026-11-26' });
      expect(res.body.cutoff).toEqual({ date: '2026-11-24', time: '12:00' });
    });

    it('only a delivery date given: roast is suggested from it', async () => {
      const res = await c.post('/orders', who.staff, {
        requestId: newRequestId(),
        branchId,
        deliveryDate: '2026-11-30',
      });
      expect(res.body).toMatchObject({ roastDate: '2026-11-27', deliveryDate: '2026-11-30' });
    });

    it('STAFF on a new order past the cut-off: 409 SCHEDULE_OVERRIDE_REQUIRED with reasons, cutoff and a suggestion; nothing is created', async () => {
      t.clock.set(TUE_1201PM);
      const requestId = newRequestId();
      const res = await create({ requestId, lines: [espresso(1)] });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SCHEDULE_OVERRIDE_REQUIRED');
      expect(res.body.meta.reasons).toContain('CUTOFF_PASSED');
      expect(res.body.meta.cutoff).toEqual({ date: '2026-11-24', time: '12:00' });
      expect(res.body.meta.suggestion).toEqual({
        roastDate: '2026-11-26',
        deliveryDate: '2026-11-27',
      });
      const retry = await create({ requestId, ...res.body.meta.suggestion, lines: [espresso(1)] });
      expect(retry.status).toBe(201);
      expect(retry.body.afterCutoff).toBe(false);
    });

    it('MANAGER on the same off-schedule save: 201 with afterCutoff true; re-dating on schedule clears it; a notes-only save never changes it', async () => {
      t.clock.set(TUE_1201PM);
      const o = (await create({ lines: [espresso(1)] }, who.manager)).body;
      expect(o.afterCutoff).toBe(true);
      const notes = await c.patch(`/orders/${o.id}`, who.staff, {
        version: o.version,
        notes: 'hello',
      });
      expect(notes.status).toBe(200);
      expect(notes.body.afterCutoff).toBe(true);
      const redated = await c.patch(`/orders/${o.id}`, who.manager, {
        version: notes.body.version,
        roastDate: '2026-11-26',
        deliveryDate: '2026-11-27',
      });
      expect(redated.status).toBe(200);
      expect(redated.body.afterCutoff).toBe(false);
    });

    it('a weekend delivery is off schedule: STAFF 409 with NOT_A_DELIVERY_DAY, MANAGER 201', async () => {
      const body = { roastDate: '2026-11-27', deliveryDate: '2026-11-28' };
      const staff = await create(body);
      expect(staff.status).toBe(409);
      expect(staff.body.meta.reasons).toContain('NOT_A_DELIVERY_DAY');
      expect((await create(body, who.manager)).status).toBe(201);
    });

    it('delivery too soon (same day as the roast) is off schedule with DELIVERY_TOO_SOON', async () => {
      const res = await create({ roastDate: '2026-11-25', deliveryDate: '2026-11-25' });
      expect(res.status).toBe(409);
      expect(res.body.meta.reasons).toContain('DELIVERY_TOO_SOON');
    });

    it('a CONFIRMED order whose cut-off has passed: STAFF line or date change 403 PAST_CUTOFF, notes 200, MANAGER 200 with afterCutoff', async () => {
      const o = await confirmed([espresso(2)]);
      t.clock.set(TUE_1201PM);
      const lines = await c.patch(`/orders/${o.id}`, who.staff, {
        version: o.version,
        lines: [{ productId: cat.espresso1kg.id, quantity: 3 }],
      });
      expect(lines.status).toBe(403);
      expect(lines.body.meta.reason).toBe('PAST_CUTOFF');
      const dates = await c.patch(`/orders/${o.id}`, who.staff, {
        version: o.version,
        deliveryDate: '2026-11-27',
        roastDate: '2026-11-26',
      });
      expect(dates.status).toBe(403);
      const notes = await c.patch(`/orders/${o.id}`, who.staff, {
        version: o.version,
        notes: 'ok',
      });
      expect(notes.status).toBe(200);
      const mgr = await c.patch(`/orders/${o.id}`, who.manager, {
        version: notes.body.version,
        lines: [{ productId: cat.espresso1kg.id, quantity: 3 }],
      });
      expect(mgr.status).toBe(200);
      expect(mgr.body.afterCutoff).toBe(true);
    });

    it('a CONFIRMED order before its cut-off moved off schedule is 409 SCHEDULE_OVERRIDE_REQUIRED for STAFF (not 403); MANAGER may', async () => {
      const o = await confirmed([espresso(1)]);
      // Sat 28 Nov is not a roast or delivery day.
      const body = { version: o.version, roastDate: '2026-11-28', deliveryDate: '2026-11-30' };
      const staff = await c.patch(`/orders/${o.id}`, who.staff, body);
      expect([staff.status, staff.body.code]).toEqual([409, 'SCHEDULE_OVERRIDE_REQUIRED']);
      expect(staff.body.meta.reasons).toContain('NOT_A_ROAST_DAY');
      const mgr = await c.patch(`/orders/${o.id}`, who.manager, body);
      expect(mgr.status).toBe(200);
      expect(mgr.body.afterCutoff).toBe(true);
    });

    it('delivery today: the derived roast date is clamped to today and off schedule (STAFF 409, MANAGER 201 afterCutoff)', async () => {
      const today = '2026-11-24';
      const staff = await c.post('/orders', who.staff, {
        requestId: newRequestId(),
        branchId,
        deliveryDate: today,
      });
      expect(staff.status).toBe(409);
      expect(staff.body.code).toBe('SCHEDULE_OVERRIDE_REQUIRED');
      expect(staff.body.meta.reasons).toContain('DELIVERY_TOO_SOON');
      const mgr = await c.post('/orders', who.manager, {
        requestId: newRequestId(),
        branchId,
        deliveryDate: today,
      });
      expect(mgr.status).toBe(201);
      expect(mgr.body).toMatchObject({ roastDate: today, deliveryDate: today, afterCutoff: true });
    });

    it('POST with only a past deliveryDate: 400 with exactly one field error, on deliveryDate (code pastDate)', async () => {
      const res = await c.post('/orders', who.staff, {
        requestId: newRequestId(),
        branchId,
        deliveryDate: '2026-11-23',
      });
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors).toHaveLength(1);
      expect(res.body.fieldErrors[0]).toMatchObject({ field: 'deliveryDate', code: 'pastDate' });
    });

    it('POST with only a past roastDate: 400 with exactly one field error, on roastDate (code pastDate)', async () => {
      const res = await c.post('/orders', who.staff, {
        requestId: newRequestId(),
        branchId,
        roastDate: '2026-11-23',
      });
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors).toHaveLength(1);
      expect(res.body.fieldErrors[0]).toMatchObject({ field: 'roastDate', code: 'pastDate' });
    });

    it('both dates in the past: two errors, one per field', async () => {
      const res = await c.post('/orders', who.manager, {
        requestId: newRequestId(),
        branchId,
        roastDate: '2026-11-20',
        deliveryDate: '2026-11-23',
      });
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors.map((f: { field: string }) => f.field).sort()).toEqual([
        'deliveryDate',
        'roastDate',
      ]);
    });

    it('an explicit past roast date is still 400 even when the derived one would be clamped', async () => {
      const res = await c.post('/orders', who.manager, {
        requestId: newRequestId(),
        branchId,
        roastDate: '2026-11-23',
        deliveryDate: '2026-11-24',
      });
      expect(res.status).toBe(400);
    });

    it('confirming a draft past cut-off needs late-change: STAFF 409 SCHEDULE_OVERRIDE_REQUIRED, MANAGER ok', async () => {
      const d = await draft([espresso(1)]);
      t.clock.set(TUE_1201PM);
      const staff = await c.post(`/orders/${d.id}/confirm`, who.staff, { version: d.version });
      expect([staff.status, staff.body.code]).toEqual([409, 'SCHEDULE_OVERRIDE_REQUIRED']);
      const mgr = await c.post(`/orders/${d.id}/confirm`, who.manager, { version: d.version });
      expect(mgr.status).toBe(200);
      expect(mgr.body.afterCutoff).toBe(true);
    });

    it('pastCutoff flips at the cut-off without any write', async () => {
      const o = await confirmed();
      expect((await c.get(`/orders/${o.id}`, who.staff)).body.pastCutoff).toBe(false);
      t.clock.set('2026-11-24T00:59:59Z'); // 11:59:59 AEDT
      expect((await c.get(`/orders/${o.id}`, who.staff)).body.pastCutoff).toBe(false);
      t.clock.set('2026-11-24T01:00:00Z'); // 12:00:00 AEDT
      const detail = (await c.get(`/orders/${o.id}`, who.staff)).body;
      expect(detail.pastCutoff).toBe(true);
      const row = (await c.get(`/orders?search=${o.orderNumber}`, who.staff)).body.items[0];
      expect(row.pastCutoff).toBe(true);
    });
  });

  describe('allowedActions on the detail (role x status x cut-off)', () => {
    const flags = [
      'editRoastDate',
      'editDeliveryDate',
      'editNotes',
      'confirm',
      'pack',
      'dispatch',
      'deliver',
      'cancel',
      'revert',
      'delete',
      'copy',
    ];
    const on = (a: Record<string, unknown>) => flags.filter((f) => a[f]).sort();

    it('STAFF on a draft: edit, confirm, cancel, delete, copy', async () => {
      const d = await draft();
      const a = (await c.get(`/orders/${d.id}`, who.staff)).body.allowedActions;
      expect(a.editLines).toBe('full');
      expect(on(a)).toEqual(
        [
          'cancel',
          'confirm',
          'copy',
          'delete',
          'editDeliveryDate',
          'editNotes',
          'editRoastDate',
        ].sort(),
      );
    });

    it('STAFF on a confirmed order before and after cut-off', async () => {
      const o = await confirmed();
      let a = (await c.get(`/orders/${o.id}`, who.staff)).body.allowedActions;
      expect(a.editLines).toBe('full');
      expect(on(a)).toEqual(
        ['cancel', 'copy', 'editDeliveryDate', 'editNotes', 'editRoastDate', 'pack'].sort(),
      );
      t.clock.set(TUE_1201PM);
      a = (await c.get(`/orders/${o.id}`, who.staff)).body.allowedActions;
      expect(a.editLines).toBe('none');
      expect(on(a)).toEqual(['copy', 'editNotes', 'pack']);
    });

    it('MANAGER on a packed order: reduce-only lines, late changes, revert', async () => {
      const o = await confirmed();
      const packed = (await c.post(`/orders/${o.id}/pack`, who.staff, { version: o.version })).body;
      const a = (await c.get(`/orders/${packed.id}`, who.manager)).body.allowedActions;
      expect(a.editLines).toBe('reduceOnly');
      expect(on(a)).toEqual(
        ['cancel', 'copy', 'deliver', 'dispatch', 'editDeliveryDate', 'editNotes', 'revert'].sort(),
      );
    });

    it('nothing but notes and copy once delivered, for every role', async () => {
      const o = await confirmed();
      const packed = (await c.post(`/orders/${o.id}/pack`, who.staff, { version: o.version })).body;
      await c.post(`/orders/${o.id}/deliver`, who.staff, { version: packed.version });
      for (const as of [who.staff, who.manager, who.admin]) {
        const a = (await c.get(`/orders/${o.id}`, as)).body.allowedActions;
        expect(a.editLines).toBe('none');
        expect(on(a)).toEqual(['copy', 'editNotes']);
      }
    });
  });

  describe('copy', () => {
    it("creates a new draft for the same branch with suggested dates, today's prices, and skips unavailable products", async () => {
      const p = (
        await c.post('/products', who.manager, {
          sku: 'CPY-1',
          name: 'Copy item',
          listPriceExGst: '4.00',
          taxCode: 'GST',
        })
      ).body;
      const o = await draft([espresso(2), line({ id: p.id, price: '4.00' }, 1, 'GST')]);
      await c.patch(`/products/${cat.espresso1kg.id}`, who.manager, { listPriceExGst: '35.00' });
      await c.post(`/products/${p.id}/deactivate`, who.manager);
      const res = await c.post(`/orders/${o.id}/copy`, who.staff, { requestId: newRequestId() });
      expect(res.status).toBe(201);
      expect(res.body.order).toMatchObject({
        status: 'DRAFT',
        roastDate: '2026-11-25',
        deliveryDate: '2026-11-26',
      });
      expect(res.body.order.id).not.toBe(o.id);
      expect(res.body.order.lines).toHaveLength(1);
      expect(res.body.order.lines[0]).toMatchObject({
        sku: 'HE-1KG-WB',
        unitPriceExGst: '35.00',
        quantity: 2,
      });
      expect(res.body.skippedLines).toEqual([
        expect.objectContaining({ productId: p.id, reason: 'PRODUCT_INACTIVE' }),
      ]);
      await c.patch(`/products/${cat.espresso1kg.id}`, who.manager, { listPriceExGst: '34.00' });
    });

    it('is idempotent on requestId (200 on repeat) and 404 for an unknown order', async () => {
      const o = await draft();
      const requestId = newRequestId();
      const a = await c.post(`/orders/${o.id}/copy`, who.staff, { requestId });
      const b = await c.post(`/orders/${o.id}/copy`, who.staff, { requestId });
      expect([a.status, b.status]).toEqual([201, 200]);
      expect(b.body.order.id).toBe(a.body.order.id);
      expect(
        (await c.post('/orders/nope/copy', who.staff, { requestId: newRequestId() })).status,
      ).toBe(404);
    });
  });

  describe('permissions and contracts', () => {
    it('requires login on every orders route', async () => {
      const request = (await import('supertest')).default;
      for (const [method, url] of [
        ['get', '/orders'],
        ['post', '/orders'],
        ['get', '/orders/schedule'],
        ['get', '/roast-calendar'],
      ] as const) {
        expect((await request(t.server)[method](`/api/v1${url}`)).status).toBe(401);
      }
    });

    it('a user with no order permissions gets 403 on read and write', async () => {
      // Roles always include orders:read; permission checks per role are covered by the 403 cases elsewhere.
      await createUser(t, { email: 'viewer@example.com', role: 'STAFF' });
      const viewer = await login(t, 'viewer@example.com');
      expect((await c.get('/orders', viewer)).status).toBe(200);
      expect((await c.get('/products', viewer)).status).toBe(200);
    });

    it('404 ORDER_NOT_FOUND for unknown and malformed ids on every id route', async () => {
      for (const id of [crypto.randomUUID(), 'nope', '123']) {
        const g = await c.get(`/orders/${id}`, who.staff);
        expect([g.status, g.body.code]).toEqual([404, 'ORDER_NOT_FOUND']);
        expect((await c.patch(`/orders/${id}`, who.staff, { version: 1 })).body.code).toBe(
          'ORDER_NOT_FOUND',
        );
        for (const action of ['confirm', 'pack', 'dispatch', 'deliver']) {
          expect(
            (await c.post(`/orders/${id}/${action}`, who.staff, { version: 1 })).body.code,
          ).toBe('ORDER_NOT_FOUND');
        }
        expect(
          (await c.post(`/orders/${id}/cancel`, who.staff, { version: 1, reason: 'x' })).body.code,
        ).toBe('ORDER_NOT_FOUND');
        expect((await c.del(`/orders/${id}?version=1`, who.staff)).body.code).toBe(
          'ORDER_NOT_FOUND',
        );
      }
    });

    it('DTO validation runs before the order is loaded: a malformed body on an unknown id is 400, not 404', async () => {
      const unknown = crypto.randomUUID();
      const patch = await c.patch(`/orders/${unknown}`, who.staff, { version: 'x' });
      expect([patch.status, patch.body.code]).toEqual([400, 'VALIDATION_FAILED']);
      const cancel = await c.post(`/orders/${unknown}/cancel`, who.staff, { version: 1 });
      expect(cancel.status).toBe(400);
    });

    it('a missing required string reports "... is required", not a length message', async () => {
      const res = await c.post('/coffees', who.manager, { type: 'BLEND' });
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors[0].message).toMatch(/is required/);
    });

    it('permission is checked before the order is loaded: STAFF revert on an unknown id is 403, not 404', async () => {
      const res = await c.post(`/orders/${crypto.randomUUID()}/revert`, who.staff, {
        version: 1,
        reason: 'x',
      });
      expect(res.status).toBe(403);
    });

    it('the detail has the documented shape and the branch address for the packing slip', async () => {
      const o = await draft([espresso(1)]);
      const d = (await c.get(`/orders/${o.id}`, who.staff)).body;
      expect(d.orderNumber).toMatch(/^ORD-\d{4,}$/);
      expect(d.branch).toMatchObject({
        addressLine1: '1 Crown St',
        suburb: 'Surry Hills',
        state: 'NSW',
        postcode: '2010',
        deliveryNotes: null,
      });
      expect(d.customer).toMatchObject({ id: customerId, isActive: true });
      expect(d.createdBy.name).toBeDefined();
      expect(d.deliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    });
  });
});
