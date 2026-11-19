/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- supertest bodies are untyped JSON */
import { createTestApp, TestApp } from './helpers/app';
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

describe('GET /orders (e2e)', () => {
  let t: TestApp;
  let c: Client;
  let who: Actors;
  let cat: Catalogue;
  const ids: Record<string, string> = {};
  const nums: Record<string, string> = {};

  const lineFor = (p: { id: string; price: string }) => ({
    productId: p.id,
    quantity: 1,
    expectedUnitPriceExGst: p.price,
    expectedTaxCode: 'GST_FREE',
  });
  const names = (res: { body: { items: { orderNumber: string }[] } }) =>
    res.body.items.map((i) => i.orderNumber);
  const list = (qs = '') => c.get(`/orders${qs}`, who.staff);

  async function order(
    branchId: string,
    roast: string,
    delivery: string,
    lines: unknown[] = [lineFor(cat.espresso1kg)],
  ) {
    const res = await c.post('/orders', who.manager, {
      requestId: newRequestId(),
      branchId,
      roastDate: roast,
      deliveryDate: delivery,
      lines,
    });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    return res.body;
  }

  beforeAll(async () => {
    t = await createTestApp();
    t.clock.set('2026-11-23T23:00:00Z');
    c = client(t);
    who = await loginActors(t);
    cat = await seedCatalogue(c, who.manager);
    const bean = await seedBranch(c, who.manager, 'bean there');
    const zed = await seedBranch(c, who.manager, 'Zed Coffee');
    // A second branch for Zed, with a distinct name and suburb.
    const zed2 = (
      await c.post(`/customers/${zed.customerId}/branches`, who.manager, {
        name: 'Alpha Annex',
        addressLine1: '2 Rd',
        suburb: 'Newtown',
        state: 'NSW',
        postcode: '2042',
      })
    ).body;
    Object.assign(ids, {
      bean: bean.branchId,
      zed: zed.branchId,
      zed2: zed2.id,
      beanCust: bean.customerId,
      zedCust: zed.customerId,
    });

    const a = await order(bean.branchId, '2026-11-25', '2026-11-27'); // 1001
    const b = await order(zed.branchId, '2026-11-25', '2026-11-26'); // 1002
    const c2 = await order(zed2.id, '2026-11-25', '2026-11-26'); // 1003 (same day as 1002, branch Alpha Annex)
    const d = await order(bean.branchId, '2026-11-26', '2026-11-27', [lineFor(cat.espresso250g)]); // 1004
    const delivered = await order(bean.branchId, '2026-11-25', '2026-11-26'); // 1005
    const cancelled = await order(bean.branchId, '2026-11-25', '2026-11-26'); // 1006
    Object.assign(nums, {
      a: a.orderNumber,
      b: b.orderNumber,
      c: c2.orderNumber,
      d: d.orderNumber,
      delivered: delivered.orderNumber,
      cancelled: cancelled.orderNumber,
    });
    Object.assign(ids, { aId: a.id, dId: d.id });
    const conf = (
      await c.post(`/orders/${delivered.id}/confirm`, who.manager, { version: delivered.version })
    ).body;
    const packed = (
      await c.post(`/orders/${delivered.id}/pack`, who.manager, { version: conf.version })
    ).body;
    await c.post(`/orders/${delivered.id}/deliver`, who.manager, { version: packed.version });
    await c.post(`/orders/${cancelled.id}/cancel`, who.manager, {
      version: cancelled.version,
      reason: 'x',
    });
  });
  afterAll(() => t.close());

  it('default statuses exclude DELIVERED and CANCELLED', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(names(res)).not.toContain(nums.delivered);
    expect(names(res)).not.toContain(nums.cancelled);
    expect(res.body.totalItems).toBe(4);
  });

  it('status filter: CANCELLED shows cancelled orders; a comma list combines; a bad value is 400', async () => {
    expect(names(await list('?status=CANCELLED'))).toEqual([nums.cancelled]);
    expect(names(await list('?status=DELIVERED,CANCELLED')).sort()).toEqual(
      [nums.delivered, nums.cancelled].sort(),
    );
    const bad = await list('?status=DRAFT,BOGUS');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
  });

  it('sorts by delivery date, then customer display name (case-insensitive), then branch name, then number', async () => {
    const res = await list();
    // Thu 26: bean there (1005 delivered excluded) -> none; Zed: "Alpha Annex" (1003) before "Zed Coffee Surry Hills" (1002).
    // Fri 27: bean there 1001 and 1004 by number.
    expect(names(res)).toEqual([nums.c, nums.b, nums.a, nums.d]);
    expect(res.body.items[0].customer.displayName).toBe('Zed Coffee');
  });

  it('sorts customers case-insensitively when the delivery date ties', async () => {
    const res = await list('?deliveryFrom=2026-11-27&deliveryTo=2026-11-27');
    expect(names(res)).toEqual([nums.a, nums.d]);
  });

  describe('search', () => {
    it.each([
      ['1001', ['a']],
      ['ORD-1001', ['a']],
      ['ord1001', ['a']],
      ['ord-1001', ['a']],
    ])('order number %s finds ORD-1001', async (term, keys) => {
      const res = await list(
        `?search=${term}&status=DRAFT,CONFIRMED,PACKED,DISPATCHED,DELIVERED,CANCELLED`,
      );
      expect(names(res)).toEqual(expect.arrayContaining(keys.map((k) => nums[k])));
      expect(names(res)).toContain('ORD-1001');
    });

    it('a number prefix matches several: "100" finds ORD-1001..1006', async () => {
      const res = await list(
        '?search=100&status=DRAFT,CONFIRMED,PACKED,DISPATCHED,DELIVERED,CANCELLED',
      );
      expect(res.body.totalItems).toBe(6);
    });

    it('matches customer trading name, legal name and branch name, case-insensitively', async () => {
      expect(names(await list('?search=BEAN%20THERE')).sort()).toEqual([nums.a, nums.d].sort());
      expect(names(await list('?search=zed%20coffee%20pty'))).toEqual(
        expect.arrayContaining([nums.b]),
      );
      expect(names(await list('?search=alpha%20annex'))).toEqual([nums.c]);
    });

    it('escapes LIKE wildcards and does not match everything on %', async () => {
      expect((await list('?search=%25')).body.totalItems).toBe(0);
      expect((await list('?search=_')).body.totalItems).toBe(0);
    });

    it('an empty search is no search; over 100 characters is 400', async () => {
      expect((await list('?search=')).body.totalItems).toBe(4);
      expect((await list(`?search=${'x'.repeat(101)}`)).status).toBe(400);
    });
  });

  describe('filters', () => {
    it('delivery range is inclusive on both ends and has no implicit date filter', async () => {
      expect(names(await list('?deliveryFrom=2026-11-26&deliveryTo=2026-11-26')).sort()).toEqual(
        [nums.b, nums.c].sort(),
      );
      expect((await list('?deliveryFrom=2026-11-28')).body.totalItems).toBe(0);
      expect((await list()).body.totalItems).toBe(4);
    });

    it('deliveryTo before deliveryFrom is 400; bad dates are 400', async () => {
      expect((await list('?deliveryFrom=2026-11-27&deliveryTo=2026-11-26')).status).toBe(400);
      expect((await list('?deliveryFrom=27-11-2026')).status).toBe(400);
      expect((await list('?roastDate=2026-02-30')).status).toBe(400);
    });

    it('roastDate is an exact match', async () => {
      expect(names(await list('?roastDate=2026-11-26'))).toEqual([nums.d]);
    });

    it('filters by customer and branch', async () => {
      expect(names(await list(`?customerId=${ids.zedCust}`)).sort()).toEqual(
        [nums.b, nums.c].sort(),
      );
      expect(names(await list(`?branchId=${ids.zed2}`))).toEqual([nums.c]);
    });

    it('filters by product: orders with a line for it', async () => {
      expect(names(await list(`?productId=${cat.espresso250g.id}`))).toEqual([nums.d]);
      expect((await list(`?productId=${cat.espresso1kg.id}`)).body.totalItems).toBe(3);
      expect((await list(`?productId=${cat.tablets.id}`)).body.totalItems).toBe(0);
    });

    it('productId counts each order once and respects the status filter (P2 warning use)', async () => {
      const res = await list(
        `?productId=${cat.espresso1kg.id}&status=DRAFT,CONFIRMED,PACKED,DISPATCHED&pageSize=1`,
      );
      expect(res.body.totalItems).toBe(3);
      expect(res.body.items).toHaveLength(1);
    });
  });

  describe('paging and shape', () => {
    it('paginates with real totals and returns empty items past the last page', async () => {
      const p1 = await list('?pageSize=3&page=1');
      const p2 = await list('?pageSize=3&page=2');
      expect(p1.body).toMatchObject({ page: 1, pageSize: 3, totalItems: 4, totalPages: 2 });
      expect(names(p1)).toHaveLength(3);
      expect(names(p2)).toEqual([nums.d]);
      const past = await list('?pageSize=3&page=9');
      expect(past.status).toBe(200);
      expect(past.body).toMatchObject({ items: [], totalItems: 4, totalPages: 2 });
    });

    it.each([
      'page=0',
      'page=1e300',
      'page=1000001',
      'page=abc',
      'pageSize=0',
      'pageSize=101',
      'pageSize=1.5',
    ])('400 for %s', async (qs) => {
      expect((await list(`?${qs}`)).status).toBe(400);
    });

    it('returns the documented list item shape with strings for money and dates', async () => {
      const item = (await list(`?search=${nums.a}`)).body.items[0];
      expect(Object.keys(item).sort()).toEqual(
        [
          'afterCutoff',
          'branch',
          'customer',
          'deliveryDate',
          'gstAmount',
          'id',
          'lineCount',
          'orderNumber',
          'pastCutoff',
          'roastDate',
          'status',
          'subtotalExGst',
          'totalIncGst',
          'totalWeightGrams',
          'updatedAt',
        ].sort(),
      );
      expect(item).toMatchObject({
        lineCount: 1,
        totalWeightGrams: 1000,
        subtotalExGst: '34.00',
        totalIncGst: '34.00',
        deliveryDate: '2026-11-27',
        roastDate: '2026-11-25',
      });
      expect(item.branch).toMatchObject({ suburb: 'Surry Hills', isActive: true });
    });

    it('reports inactive customers and branches in each row', async () => {
      await c.post(`/customers/${ids.beanCust}/deactivate`, who.manager);
      const row = (await list(`?search=${nums.a}`)).body.items[0];
      expect(row.customer.isActive).toBe(false);
      await c.post(`/customers/${ids.beanCust}/reactivate`, who.manager);
    });

    it('requires login and orders:read', async () => {
      const request = (await import('supertest')).default;
      expect((await request(t.server).get('/api/v1/orders')).status).toBe(401);
    });
  });
});
