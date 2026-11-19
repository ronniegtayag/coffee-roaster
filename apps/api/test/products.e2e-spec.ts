/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- supertest bodies are untyped JSON */
import { createTestApp, TestApp } from './helpers/app';
import { Actors, client, Client, loginActors } from './helpers/domain';

describe('coffees, grinds and products (e2e)', () => {
  let t: TestApp;
  let c: Client;
  let who: Actors;
  let grinds: Record<string, string>;

  beforeAll(async () => {
    t = await createTestApp();
    c = client(t);
    who = await loginActors(t);
    const g = await c.get('/grinds', who.manager);
    grinds = Object.fromEntries(
      g.body.items.map((x: { name: string; id: string }) => [x.name, x.id]),
    );
  });
  afterAll(() => t.close());

  const coffee = async (name: string) =>
    (await c.post('/coffees', who.manager, { name, type: 'BLEND' })).body;
  const sku = (() => {
    let n = 0;
    return () => `SKU-${++n}`;
  })();
  const coffeeProduct = (coffeeId: string, over: Record<string, unknown> = {}) => ({
    sku: sku(),
    coffeeId,
    bagSizeGrams: 1000,
    grindId: grinds['Whole bean'],
    listPriceExGst: '34.00',
    taxCode: 'GST_FREE',
    ...over,
  });

  describe('grinds', () => {
    it('are seeded by the migration: Whole bean, Espresso, Filter, in order', async () => {
      const res = await c.get('/grinds', who.staff);
      expect(res.status).toBe(200);
      expect(res.body.items.map((g: { name: string }) => g.name)).toEqual([
        'Whole bean',
        'Espresso',
        'Filter',
      ]);
    });
  });

  describe('coffees', () => {
    it('creates, trims, and returns the shape', async () => {
      const res = await c.post('/coffees', who.manager, {
        name: '  Ethiopia Guji ',
        type: 'SINGLE_ORIGIN',
        origin: ' Ethiopia ',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Ethiopia Guji',
        type: 'SINGLE_ORIGIN',
        origin: 'Ethiopia',
        description: null,
        isActive: true,
        activeProductCount: 0,
      });
    });

    it('rejects a duplicate name case-insensitively, including inactive coffees, with COFFEE_NAME_TAKEN', async () => {
      const first = await coffee('Decaf Colombia');
      const dup = await c.post('/coffees', who.manager, { name: 'decaf colombia', type: 'BLEND' });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('COFFEE_NAME_TAKEN');
      await c.post(`/coffees/${first.id}/deactivate`, who.manager);
      expect(
        (await c.post('/coffees', who.manager, { name: 'DECAF COLOMBIA', type: 'BLEND' })).status,
      ).toBe(409);
    });

    it.each([
      'house espresso',
      ' House Espresso ',
      'HOUSE ESPRESSO',
      'House  Espresso'.replace('  ', ' '),
    ])(
      'COFFEE_NAME_TAKEN for %j when "Case Blend" style names collide, ignoring case and outer spaces',
      async (variant) => {
        const base = `Dup ${variant.trim().toLowerCase().replace(/\s+/g, '-')}`;
        await c.post('/coffees', who.manager, { name: base, type: 'BLEND' });
        const res = await c.post('/coffees', who.manager, {
          name: `  ${base.toUpperCase()}  `,
          type: 'BLEND',
        });
        expect([res.status, res.body.code]).toEqual([409, 'COFFEE_NAME_TAKEN']);
      },
    );

    it('two simultaneous creates of the same coffee name: exactly one wins', async () => {
      const results = await Promise.all(
        ['Race Roast', ' race roast ', 'RACE ROAST'].map((name) =>
          c.post('/coffees', who.manager, { name, type: 'BLEND' }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      expect(
        results.filter((r) => r.status === 409).every((r) => r.body.code === 'COFFEE_NAME_TAKEN'),
      ).toBe(true);
    });

    it('PATCH onto another coffee name is COFFEE_NAME_TAKEN, but keeping its own name (even re-cased) is fine', async () => {
      const a = await coffee('Patch Name A');
      const b = await coffee('Patch Name B');
      const clash = await c.patch(`/coffees/${b.id}`, who.manager, { name: ' patch name a ' });
      expect([clash.status, clash.body.code]).toEqual([409, 'COFFEE_NAME_TAKEN']);
      expect(
        (await c.patch(`/coffees/${a.id}`, who.manager, { name: 'PATCH NAME A' })).status,
      ).toBe(200);
    });

    it('grind names are unique the same way (POST, PATCH and a race), with GRIND_NAME_TAKEN', async () => {
      const dup = await c.post('/grinds', who.manager, { name: ' whole BEAN ' });
      expect([dup.status, dup.body.code]).toEqual([409, 'GRIND_NAME_TAKEN']);
      const g = (await c.post('/grinds', who.manager, { name: 'Cold brew', sortOrder: 50 })).body;
      const clash = await c.patch(`/grinds/${g.id}`, who.manager, { name: 'espresso' });
      expect([clash.status, clash.body.code]).toEqual([409, 'GRIND_NAME_TAKEN']);
      const results = await Promise.all(
        ['Pour over', ' pour OVER'].map((name) => c.post('/grinds', who.manager, { name })),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('deactivatedAt on coffees and products comes from the injected clock', async () => {
      t.clock.set('2026-11-23T23:05:00Z');
      const cf = await coffee('Clock Roast');
      const p = (
        await c.post('/products', who.manager, {
          sku: 'CLK-1',
          name: 'Clock item',
          listPriceExGst: '1.00',
          taxCode: 'GST',
        })
      ).body;
      expect((await c.post(`/coffees/${cf.id}/deactivate`, who.manager)).body.deactivatedAt).toBe(
        '2026-11-23T23:05:00.000Z',
      );
      expect((await c.post(`/products/${p.id}/deactivate`, who.manager)).body.deactivatedAt).toBe(
        '2026-11-23T23:05:00.000Z',
      );
    });

    it.each([
      ['missing name', { type: 'BLEND' }],
      ['blank name', { name: '  ', type: 'BLEND' }],
      ['bad type', { name: 'X', type: 'ROAST' }],
      ['name over 100', { name: 'x'.repeat(101), type: 'BLEND' }],
      ['unknown field', { name: 'X', type: 'BLEND', roastLevel: 'dark' }],
    ])('400 for %s', async (_l, body) => {
      const res = await c.post('/coffees', who.manager, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('deactivate and reactivate are idempotent and keep each product isActive unchanged', async () => {
      const cf = await coffee('Idempotent Blend');
      const p = (await c.post('/products', who.manager, coffeeProduct(cf.id))).body;
      const d1 = await c.post(`/coffees/${cf.id}/deactivate`, who.manager);
      const d2 = await c.post(`/coffees/${cf.id}/deactivate`, who.manager);
      expect([d1.status, d2.status]).toEqual([200, 200]);
      expect(d2.body.deactivatedAt).toBe(d1.body.deactivatedAt);
      const prod = (await c.get(`/products/${p.id}`, who.manager)).body;
      expect(prod).toMatchObject({ isActive: true, orderable: false });
      await c.post(`/coffees/${cf.id}/reactivate`, who.manager);
      expect((await c.get(`/products/${p.id}`, who.manager)).body.orderable).toBe(true);
    });

    it('404 COFFEE_NOT_FOUND for unknown and malformed ids', async () => {
      for (const id of ['018f0000-0000-7000-8000-000000000000', 'nope']) {
        const res = await c.get(`/coffees/${id}`, who.manager);
        expect([res.status, res.body.code]).toEqual([404, 'COFFEE_NOT_FOUND']);
      }
    });

    it('lists with status and search filters, and detail includes its products active first', async () => {
      const cf = await coffee('Searchable Roast');
      await c.post('/products', who.manager, coffeeProduct(cf.id));
      const res = await c.get('/coffees?search=searchable', who.staff);
      expect(res.body.items.map((x: { name: string }) => x.name)).toEqual(['Searchable Roast']);
      expect(res.body.items[0].activeProductCount).toBe(1);
      const detail = await c.get(`/coffees/${cf.id}`, who.staff);
      expect(detail.body.products).toHaveLength(1);
      expect((await c.get('/coffees?status=bogus', who.staff)).status).toBe(400);
    });
  });

  describe('products', () => {
    it('creates a coffee product: SKU upper-cased and trimmed, price as 2dp string, display name built by the API', async () => {
      const cf = await coffee('Display Blend');
      const res = await c.post(
        '/products',
        who.manager,
        coffeeProduct(cf.id, { sku: ' he-1kg-wb ', listPriceExGst: '34' }),
      );
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        sku: 'HE-1KG-WB',
        kind: 'COFFEE',
        displayName: 'Display Blend — 1 kg — Whole bean',
        name: null,
        bagSizeGrams: 1000,
        listPriceExGst: '34.00',
        taxCode: 'GST_FREE',
        isActive: true,
        orderable: true,
      });
      expect(res.body.coffee).toMatchObject({ id: cf.id, name: 'Display Blend', isActive: true });
      expect(res.body.grind).toMatchObject({ id: grinds['Whole bean'] });
    });

    it.each([
      [250, '250 g'],
      [1000, '1 kg'],
      [1500, '1.5 kg'],
      [2270, '2.27 kg'],
    ])('display name for %i g is "%s"', async (grams, text) => {
      const cf = await coffee(`Size ${grams}`);
      const res = await c.post(
        '/products',
        who.manager,
        coffeeProduct(cf.id, { bagSizeGrams: grams }),
      );
      expect(res.body.displayName).toBe(`Size ${grams} — ${text} — Whole bean`);
    });

    it('creates a non-coffee product that uses its name', async () => {
      const res = await c.post('/products', who.manager, {
        sku: sku(),
        name: 'Cleaning tablets',
        listPriceExGst: '18.18',
        taxCode: 'GST',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        kind: 'OTHER',
        displayName: 'Cleaning tablets',
        coffee: null,
        grind: null,
        bagSizeGrams: null,
      });
    });

    it('SKU_TAKEN on a duplicate SKU, case-insensitively', async () => {
      const cf = await coffee('Sku Blend');
      await c.post('/products', who.manager, coffeeProduct(cf.id, { sku: 'dup-sku' }));
      const res = await c.post('/products', who.manager, {
        sku: 'DUP-sku',
        name: 'Other',
        listPriceExGst: '1.00',
        taxCode: 'GST',
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SKU_TAKEN');
    });

    it('allows one active product per coffee+size+grind; PRODUCT_VARIANT_EXISTS names it; inactive duplicates are fine until reactivation', async () => {
      const cf = await coffee('Variant Blend');
      const first = (await c.post('/products', who.manager, coffeeProduct(cf.id))).body;
      const dup = await c.post('/products', who.manager, coffeeProduct(cf.id));
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('PRODUCT_VARIANT_EXISTS');
      expect(dup.body.meta).toMatchObject({
        productId: first.id,
        displayName: 'Variant Blend — 1 kg — Whole bean',
      });

      await c.post(`/products/${first.id}/deactivate`, who.manager);
      const second = await c.post('/products', who.manager, coffeeProduct(cf.id));
      expect(second.status).toBe(201);
      const reactivate = await c.post(`/products/${first.id}/reactivate`, who.manager);
      expect(reactivate.status).toBe(409);
      expect(reactivate.body.code).toBe('PRODUCT_VARIANT_EXISTS');
    });

    it.each([
      ['coffee product with a name', (cf: string) => ({ ...coffeeProduct(cf), name: 'Nope' })],
      [
        'coffee product missing the grind',
        (cf: string) => ({ ...coffeeProduct(cf), grindId: undefined }),
      ],
      [
        'non-coffee with a bag size',
        () => ({
          sku: 'X-1',
          name: 'Tablets',
          bagSizeGrams: 250,
          listPriceExGst: '1.00',
          taxCode: 'GST',
        }),
      ],
      ['neither coffee nor name', () => ({ sku: 'X-2', listPriceExGst: '1.00', taxCode: 'GST' })],
    ])('400 productKind for %s', async (_l, build) => {
      const cf = await coffee(`Kind ${Math.random()}`);
      const res = await c.post('/products', who.manager, build(cf.id));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(res.body.fieldErrors)).toMatch(/productKind/);
    });

    it.each([0, -250, 250.5, '250', 100001])('400 for bag size %p', async (grams) => {
      const cf = await coffee(`Bag ${String(grams)} ${Math.random()}`);
      const res = await c.post(
        '/products',
        who.manager,
        coffeeProduct(cf.id, { bagSizeGrams: grams }),
      );
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors.map((f: { field: string }) => f.field)).toContain('bagSizeGrams');
    });

    it.each(['34.005', '-1', '0', '0.00', '1e3', 34, '10000.00', '', 'abc', null])(
      '400 for price %p',
      async (price) => {
        const res = await c.post('/products', who.manager, {
          sku: sku(),
          name: 'Priced',
          listPriceExGst: price,
          taxCode: 'GST',
        });
        expect(res.status).toBe(400);
        expect(res.body.fieldErrors.map((f: { field: string }) => f.field)).toContain(
          'listPriceExGst',
        );
      },
    );

    it.each([['0.01'], ['9999.99'], ['12.3']])('accepts price %s', async (price) => {
      const res = await c.post('/products', who.manager, {
        sku: sku(),
        name: `P ${price}`,
        listPriceExGst: price,
        taxCode: 'GST',
      });
      expect(res.status).toBe(201);
      expect(res.body.listPriceExGst).toMatch(/^\d+\.\d{2}$/);
    });

    it('requires an explicit tax code (no default)', async () => {
      const res = await c.post('/products', who.manager, {
        sku: sku(),
        name: 'No tax',
        listPriceExGst: '1.00',
      });
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors.map((f: { field: string }) => f.field)).toContain('taxCode');
    });

    it('400 notFound for an unknown coffee or grind, and for an inactive grind', async () => {
      const bad = await c.post(
        '/products',
        who.manager,
        coffeeProduct('018f0000-0000-7000-8000-000000000000'),
      );
      expect(bad.status).toBe(400);
      const cf = await coffee('Grind check');
      const g = await c.post('/grinds', who.manager, { name: 'Moka pot', sortOrder: 40 });
      expect(g.status).toBe(201);
      await c.post(`/grinds/${g.body.id}/deactivate`, who.manager);
      const res = await c.post(
        '/products',
        who.manager,
        coffeeProduct(cf.id, { grindId: g.body.id }),
      );
      expect(res.status).toBe(400);
    });

    it('PATCH changes price, tax code and SKU but rejects coffeeId, bagSizeGrams, grindId and name on a coffee product', async () => {
      const cf = await coffee('Patch Blend');
      const p = (await c.post('/products', who.manager, coffeeProduct(cf.id))).body;
      const ok = await c.patch(`/products/${p.id}`, who.manager, {
        listPriceExGst: '36.00',
        taxCode: 'GST',
        sku: 'new-sku',
      });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ listPriceExGst: '36.00', taxCode: 'GST', sku: 'NEW-SKU' });
      for (const body of [{ coffeeId: cf.id }, { bagSizeGrams: 500 }, { grindId: grinds.Filter }]) {
        const res = await c.patch(`/products/${p.id}`, who.manager, body);
        expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
      }
      const named = await c.patch(`/products/${p.id}`, who.manager, { name: 'Renamed' });
      expect(named.status).toBe(400);
      expect(JSON.stringify(named.body.fieldErrors)).toMatch(/productKind/);
    });

    it('deactivate and reactivate are idempotent', async () => {
      const p = (
        await c.post('/products', who.manager, {
          sku: sku(),
          name: 'Toggle',
          listPriceExGst: '1.00',
          taxCode: 'GST',
        })
      ).body;
      const d1 = await c.post(`/products/${p.id}/deactivate`, who.manager);
      const d2 = await c.post(`/products/${p.id}/deactivate`, who.manager);
      expect(d1.body.isActive).toBe(false);
      expect(d2.body.deactivatedAt).toBe(d1.body.deactivatedAt);
      const r = await c.post(`/products/${p.id}/reactivate`, who.manager);
      expect(r.body).toMatchObject({ isActive: true, deactivatedAt: null });
    });

    it('has no DELETE routes and 404 PRODUCT_NOT_FOUND for bad ids', async () => {
      const p = (
        await c.post('/products', who.manager, {
          sku: sku(),
          name: 'Keep',
          listPriceExGst: '1.00',
          taxCode: 'GST',
        })
      ).body;
      expect((await c.del(`/products/${p.id}`, who.manager)).status).toBe(404);
      for (const id of ['018f0000-0000-7000-8000-000000000000', 'nope']) {
        const res = await c.get(`/products/${id}`, who.manager);
        expect([res.status, res.body.code]).toEqual([404, 'PRODUCT_NOT_FOUND']);
      }
    });

    it('lists with search (coffee, name, SKU), status and kind filters in the documented sort order', async () => {
      const cf = await coffee('Zed Sorted');
      const af = await coffee('Alpha Sorted');
      await c.post(
        '/products',
        who.manager,
        coffeeProduct(cf.id, { sku: 'ZED-1', bagSizeGrams: 1000 }),
      );
      await c.post(
        '/products',
        who.manager,
        coffeeProduct(af.id, { sku: 'ALP-250', bagSizeGrams: 250 }),
      );
      await c.post(
        '/products',
        who.manager,
        coffeeProduct(af.id, { sku: 'ALP-1K', bagSizeGrams: 1000 }),
      );
      const list = await c.get('/products?search=sorted&kind=coffee&pageSize=100', who.staff);
      const names = list.body.items.map((p: { displayName: string }) => p.displayName);
      expect(names).toEqual([
        'Alpha Sorted — 250 g — Whole bean',
        'Alpha Sorted — 1 kg — Whole bean',
        'Zed Sorted — 1 kg — Whole bean',
      ]);
      expect((await c.get('/products?search=alp-250', who.staff)).body.totalItems).toBe(1);
      expect(
        (await c.get('/products?kind=other', who.staff)).body.items.every(
          (p: { kind: string }) => p.kind === 'OTHER',
        ),
      ).toBe(true);
      expect((await c.get('/products?kind=bogus', who.staff)).status).toBe(400);
    });

    it('orderable excludes inactive products and products of inactive coffees', async () => {
      const cf = await coffee('Orderable Blend');
      const a = (await c.post('/products', who.manager, coffeeProduct(cf.id, { sku: 'ORD-A' })))
        .body;
      const b = (
        await c.post(
          '/products',
          who.manager,
          coffeeProduct(cf.id, { sku: 'ORD-B', bagSizeGrams: 250 }),
        )
      ).body;
      await c.post(`/products/${b.id}/deactivate`, who.manager);
      let ids = (await c.get('/products/orderable', who.staff)).body.items.map(
        (p: { id: string }) => p.id,
      );
      expect(ids).toContain(a.id);
      expect(ids).not.toContain(b.id);
      await c.post(`/coffees/${cf.id}/deactivate`, who.manager);
      ids = (await c.get('/products/orderable', who.staff)).body.items.map(
        (p: { id: string }) => p.id,
      );
      expect(ids).not.toContain(a.id);
    });
  });

  describe('permissions', () => {
    it('STAFF can read but gets 403 FORBIDDEN on every catalogue write', async () => {
      const cf = await coffee('Perm Blend');
      const p = (await c.post('/products', who.manager, coffeeProduct(cf.id))).body;
      expect((await c.get('/products', who.staff)).status).toBe(200);
      expect((await c.get('/coffees', who.staff)).status).toBe(200);
      const writes = [
        c.post('/coffees', who.staff, { name: 'S', type: 'BLEND' }),
        c.patch(`/coffees/${cf.id}`, who.staff, { name: 'S' }),
        c.post(`/coffees/${cf.id}/deactivate`, who.staff),
        c.post('/products', who.staff, coffeeProduct(cf.id)),
        c.patch(`/products/${p.id}`, who.staff, { listPriceExGst: '1.00' }),
        c.post(`/products/${p.id}/deactivate`, who.staff),
        c.post('/grinds', who.staff, { name: 'S' }),
      ];
      for (const res of await Promise.all(writes)) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN');
      }
      expect((await c.get(`/products/${p.id}`, who.manager)).body.isActive).toBe(true);
    });

    it('requires login', async () => {
      const res = await (await import('supertest')).default(t.server).get('/api/v1/products');
      expect(res.status).toBe(401);
    });
  });
});
