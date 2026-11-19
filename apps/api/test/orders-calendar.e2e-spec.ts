/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- supertest bodies are untyped JSON */
import { createTestApp, TestApp } from './helpers/app';
import {
  Actors,
  client,
  Client,
  loginActors,
  newRequestId,
  seedBranch,
  seedCatalogue,
} from './helpers/domain';

const defaults = {
  roastDays: [1, 2, 3, 4, 5],
  deliveryDays: [1, 2, 3, 4, 5],
  businessDays: [1, 2, 3, 4, 5],
  cutoffTime: '12:00',
  cutoffLeadBusinessDays: 1,
  deliveryLagBusinessDays: 1,
};

describe('roast calendar, schedule and roast summary (e2e)', () => {
  let t: TestApp;
  let c: Client;
  let who: Actors;

  const suggest = async (iso: string, deliveryDate?: string) => {
    t.clock.set(iso);
    const res = await c.get(
      `/orders/schedule${deliveryDate ? `?deliveryDate=${deliveryDate}` : ''}`,
      who.staff,
    );
    expect(res.status).toBe(200);
    return res.body;
  };
  const reset = async () => {
    await t.prisma.closureDay.deleteMany();
    await c.put('/roast-calendar', who.admin, defaults); // also clears the service's 60 s cache
  };

  beforeAll(async () => {
    t = await createTestApp();
    c = client(t);
    who = await loginActors(t);
  });
  beforeEach(reset);
  afterAll(() => t.close());

  describe('GET /roast-calendar', () => {
    it('returns the migration defaults to anyone who can read orders', async () => {
      const res = await c.get('/roast-calendar', who.staff);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(defaults);
      expect(res.body.updatedAt).toMatch(/Z$/);
    });
  });

  describe('suggestions from now (design §5.2)', () => {
    it.each([
      ['Tue 24 Nov 10:00', '2026-11-23T23:00:00Z', '2026-11-25', '2026-11-26'],
      ['Tue 24 Nov 12:01', '2026-11-24T01:01:00Z', '2026-11-26', '2026-11-27'],
      ['Tue 24 Nov exactly 12:00:00', '2026-11-24T01:00:00Z', '2026-11-26', '2026-11-27'],
      ['Tue 24 Nov 11:59:59', '2026-11-24T00:59:59Z', '2026-11-25', '2026-11-26'],
      ['Fri 27 Nov 15:00', '2026-11-27T04:00:00Z', '2026-12-01', '2026-12-02'],
    ])('%s', async (_l, now, roast, delivery) => {
      expect(await suggest(now)).toMatchObject({
        roastDate: roast,
        deliveryDate: delivery,
        onSchedule: true,
        reasons: [],
      });
    });

    it('the Sydney/UTC boundary: Mon 23 Nov 23:30 Sydney (12:30Z) still counts as Monday', async () => {
      expect(await suggest('2026-11-23T12:30:00Z')).toMatchObject({
        roastDate: '2026-11-25',
        cutoff: { date: '2026-11-24', time: '12:00' },
      });
    });

    it('DST oracles: AEDT (6 Oct) and AEST (9 Jun) cut-offs at 12:00 Sydney', async () => {
      // Tue 6 Oct 2026: 11:59:59 AEDT is still before the cut-off for Wed 7 Oct.
      expect((await suggest('2026-10-06T00:59:59Z')).roastDate).toBe('2026-10-07');
      expect((await suggest('2026-10-06T01:00:00Z')).roastDate).toBe('2026-10-08');
      // Tue 9 Jun 2026: 11:59:59 AEST before; 12:00:00 AEST past.
      expect((await suggest('2026-06-09T01:59:59Z')).roastDate).toBe('2026-06-10');
      expect((await suggest('2026-06-09T02:00:00Z')).roastDate).toBe('2026-06-11');
    });

    it('the changeover weekends: first Sunday in October and April', async () => {
      // Fri 2 Oct 2026 15:00 AEST: next roast is Mon 5 Oct is wrong (cut-off Fri 12:00 passed) -> Tue 6.
      expect((await suggest('2026-10-02T05:00:00Z')).roastDate).toBe('2026-10-06');
      // Fri 3 Apr 2026 15:00 AEDT (Good Friday is not a closure here): next roast Tue 7 Apr.
      expect((await suggest('2026-04-03T04:00:00Z')).roastDate).toBe('2026-04-07');
    });

    it('delivery date -> roast: Fri 27 Nov -> Thu 26, Mon 30 Nov -> Fri 27', async () => {
      t.clock.set('2026-11-23T23:00:00Z');
      expect(await suggest('2026-11-23T23:00:00Z', '2026-11-27')).toMatchObject({
        roastDate: '2026-11-26',
        deliveryDate: '2026-11-27',
        onSchedule: true,
      });
      expect((await suggest('2026-11-23T23:00:00Z', '2026-11-30')).roastDate).toBe('2026-11-27');
    });

    it('a delivery date that is too late for the cut-off is returned with onSchedule false', async () => {
      const s = await suggest('2026-11-24T01:01:00Z', '2026-11-26');
      expect(s).toMatchObject({ roastDate: '2026-11-25', onSchedule: false });
      expect(s.reasons).toContain('CUTOFF_PASSED');
    });

    it('delivery today: roast is clamped to today, off schedule, with DELIVERY_TOO_SOON', async () => {
      const s = await suggest('2026-11-23T23:00:00Z', '2026-11-24');
      expect(s).toMatchObject({
        roastDate: '2026-11-24',
        deliveryDate: '2026-11-24',
        onSchedule: false,
      });
      expect(s.reasons).toContain('DELIVERY_TOO_SOON');
    });

    it('a delivery date in the past is 400 on the schedule endpoint, not a suggestion', async () => {
      t.clock.set('2026-11-23T23:00:00Z');
      const res = await c.get('/orders/schedule?deliveryDate=2026-11-23', who.staff);
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors[0]).toMatchObject({ field: 'deliveryDate', code: 'pastDate' });
    });

    it('rejects a malformed delivery date', async () => {
      const res = await c.get('/orders/schedule?deliveryDate=26-11-2026', who.staff);
      expect(res.status).toBe(400);
    });
  });

  describe('closures (R2)', () => {
    it('Christmas: Wed 23 Dec 13:00 with Fri 25 and Mon 28 closed -> roast Tue 29, deliver Wed 30', async () => {
      for (const [date, description] of [
        ['2026-12-25', 'Christmas Day'],
        ['2026-12-28', 'Boxing Day (observed)'],
      ]) {
        expect(
          (await c.post('/roast-calendar/closures', who.admin, { date, description })).status,
        ).toBe(201);
      }
      expect(await suggest('2026-12-23T02:00:00Z')).toMatchObject({
        roastDate: '2026-12-29',
        deliveryDate: '2026-12-30',
        cutoff: { date: '2026-12-24', time: '12:00' },
      });
    });

    it('a closure on the cut-off day moves the cut-off to the business day before', async () => {
      await c.post('/roast-calendar/closures', who.admin, {
        date: '2026-11-24',
        description: 'Shutdown',
      });
      expect(await suggest('2026-11-22T23:00:00Z')).toMatchObject({
        roastDate: '2026-11-25',
        cutoff: { date: '2026-11-23', time: '12:00' },
      });
    });

    it('a closure on the delivery day pushes delivery to the next delivery day', async () => {
      await c.post('/roast-calendar/closures', who.admin, {
        date: '2026-11-26',
        description: 'Closed',
      });
      expect(await suggest('2026-11-23T23:00:00Z')).toMatchObject({
        roastDate: '2026-11-25',
        deliveryDate: '2026-11-27',
      });
    });

    it('lists upcoming closures by date, filters by range, and rejects a duplicate with CLOSURE_EXISTS', async () => {
      await c.post('/roast-calendar/closures', who.admin, { date: '2026-12-26', description: 'B' });
      await c.post('/roast-calendar/closures', who.admin, { date: '2026-12-25', description: 'A' });
      t.clock.set('2026-11-23T23:00:00Z');
      const all = await c.get('/roast-calendar/closures?from=2026-12-01', who.staff);
      expect(all.body.items.map((i: { date: string }) => i.date)).toEqual([
        '2026-12-25',
        '2026-12-26',
      ]);
      expect(
        (await c.get('/roast-calendar/closures?from=2026-12-26&to=2026-12-31', who.staff)).body
          .items,
      ).toHaveLength(1);
      const dup = await c.post('/roast-calendar/closures', who.admin, {
        date: '2026-12-25',
        description: 'again',
      });
      expect([dup.status, dup.body.code]).toEqual([409, 'CLOSURE_EXISTS']);
    });

    it('deleting a closure restores the day; unknown ids are 404 CLOSURE_NOT_FOUND', async () => {
      const closure = (
        await c.post('/roast-calendar/closures', who.admin, {
          date: '2026-11-26',
          description: 'Temp',
        })
      ).body;
      expect((await suggest('2026-11-23T23:00:00Z')).deliveryDate).toBe('2026-11-27');
      expect((await c.del(`/roast-calendar/closures/${closure.id}`, who.admin)).status).toBe(204);
      expect((await suggest('2026-11-23T23:00:00Z')).deliveryDate).toBe('2026-11-26');
      for (const id of [closure.id, 'nope']) {
        const res = await c.del(`/roast-calendar/closures/${id}`, who.admin);
        expect([res.status, res.body.code]).toEqual([404, 'CLOSURE_NOT_FOUND']);
      }
    });

    it.each([
      ['bad date', { date: '25/12/2026', description: 'x' }],
      ['impossible date', { date: '2026-02-30', description: 'x' }],
      ['blank description', { date: '2026-12-25', description: '  ' }],
      ['long description', { date: '2026-12-25', description: 'd'.repeat(101) }],
    ])('400 for %s', async (_l, body) => {
      expect((await c.post('/roast-calendar/closures', who.admin, body)).status).toBe(400);
    });
  });

  describe('settings (R3)', () => {
    it('OQ-PO-8: roasting Mon and Thu, delivering Mon to Fri: Tue 10:00 -> roast Thu 26, deliver Fri 27', async () => {
      expect(
        (await c.put('/roast-calendar', who.admin, { ...defaults, roastDays: [4, 1] })).body
          .roastDays,
      ).toEqual([1, 4]);
      expect(await suggest('2026-11-23T23:00:00Z')).toMatchObject({
        roastDate: '2026-11-26',
        deliveryDate: '2026-11-27',
      });
    });

    it('deliveryLagBusinessDays 0 delivers on the roast day; cutoffLeadBusinessDays 0 puts the cut-off on the roast day', async () => {
      await c.put('/roast-calendar', who.admin, {
        ...defaults,
        deliveryLagBusinessDays: 0,
        cutoffLeadBusinessDays: 0,
      });
      expect(await suggest('2026-11-23T23:00:00Z')).toMatchObject({
        roastDate: '2026-11-24',
        deliveryDate: '2026-11-24',
        cutoff: { date: '2026-11-24', time: '12:00' },
      });
      expect(await suggest('2026-11-24T01:01:00Z')).toMatchObject({ roastDate: '2026-11-25' });
    });

    it('a different cut-off time applies immediately (cache cleared on PUT)', async () => {
      expect((await suggest('2026-11-24T00:00:00Z')).roastDate).toBe('2026-11-25'); // Tue 11:00
      await c.put('/roast-calendar', who.admin, { ...defaults, cutoffTime: '10:30' });
      expect((await suggest('2026-11-24T00:00:00Z')).roastDate).toBe('2026-11-26');
    });

    it('deduplicates and sorts weekday lists', async () => {
      const res = await c.put('/roast-calendar', who.admin, {
        ...defaults,
        roastDays: [3, 1, 3, 1],
      });
      expect(res.body.roastDays).toEqual([1, 3]);
    });

    it.each(['roastDays', 'deliveryDays', 'businessDays'])(
      'PUT requires %s (missing is 400)',
      async (field) => {
        const body: Record<string, unknown> = { ...defaults };
        delete body[field];
        const res = await c.put('/roast-calendar', who.admin, body);
        expect(res.status).toBe(400);
        expect(res.body.fieldErrors.map((f: { field: string }) => f.field)).toContain(field);
        const nulled = await c.put('/roast-calendar', who.admin, { ...defaults, [field]: null });
        expect(nulled.status).toBe(400);
      },
    );

    it.each([
      ['empty roastDays', { roastDays: [] }],
      ['weekday 0', { roastDays: [0, 1] }],
      ['weekday 8', { deliveryDays: [8] }],
      ['bad cutoffTime', { cutoffTime: '25:00' }],
      ['cutoffTime without colon', { cutoffTime: '1200' }],
      ['lead above 14', { cutoffLeadBusinessDays: 15 }],
      ['negative lag', { deliveryLagBusinessDays: -1 }],
      ['fractional lag', { deliveryLagBusinessDays: 0.5 }],
    ])('400 for %s', async (_l, over) => {
      const res = await c.put('/roast-calendar', who.admin, { ...defaults, ...over });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('NO_SCHEDULE_AVAILABLE (409) when every day for a year is closed', async () => {
      t.clock.set('2026-11-23T23:00:00Z');
      const start = Date.UTC(2026, 10, 24);
      await t.prisma.closureDay.createMany({
        data: Array.from({ length: 400 }, (_, i) => ({
          date: new Date(start + i * 86_400_000),
          description: 'Closed',
        })),
      });
      await c.put('/roast-calendar', who.admin, defaults); // clear the cache
      const res = await c.get('/orders/schedule', who.staff);
      expect([res.status, res.body.code]).toEqual([409, 'NO_SCHEDULE_AVAILABLE']);
    });
  });

  describe('permissions', () => {
    it('only ADMIN can change settings and closures; MANAGER and STAFF get 403', async () => {
      const closure = (
        await c.post('/roast-calendar/closures', who.admin, {
          date: '2026-12-25',
          description: 'Xmas',
        })
      ).body;
      for (const as of [who.manager, who.staff]) {
        const calls = await Promise.all([
          c.put('/roast-calendar', as, defaults),
          c.post('/roast-calendar/closures', as, { date: '2026-12-26', description: 'x' }),
          c.del(`/roast-calendar/closures/${closure.id}`, as),
        ]);
        for (const res of calls) {
          expect(res.status).toBe(403);
          expect(res.body.code).toBe('FORBIDDEN');
        }
      }
      expect((await c.get('/roast-calendar', who.manager)).status).toBe(200);
    });
  });

  describe('roast summary (L3)', () => {
    it('totals CONFIRMED orders only, per coffee, excluding non-coffee lines', async () => {
      t.clock.set('2026-11-23T23:00:00Z');
      const cat = await seedCatalogue(c, who.manager);
      const { branchId } = await seedBranch(c, who.manager, 'Summary Cafe');
      const line = (p: { id: string; price: string }, quantity: number, taxCode = 'GST_FREE') => ({
        productId: p.id,
        quantity,
        expectedUnitPriceExGst: p.price,
        expectedTaxCode: taxCode,
      });
      const mk = async (lines: unknown[], confirm: boolean) => {
        const o = (
          await c.post('/orders', who.staff, {
            requestId: newRequestId(),
            branchId,
            roastDate: '2026-11-25',
            deliveryDate: '2026-11-26',
            lines,
          })
        ).body;
        if (confirm) await c.post(`/orders/${o.id}/confirm`, who.staff, { version: o.version });
        return o;
      };
      await mk(
        [line(cat.espresso1kg, 12), line(cat.espresso250g, 4), line(cat.tablets, 2, 'GST')],
        true,
      );
      await mk([line(cat.espresso1kg, 1)], true);
      await mk([line(cat.espresso1kg, 50)], false); // draft: excluded
      const cancelled = await mk([line(cat.espresso1kg, 30)], true);
      await c.post(`/orders/${cancelled.id}/cancel`, who.staff, {
        version: cancelled.version + 1,
        reason: 'x',
      });

      const res = await c.get('/orders/roast-summary?roastDate=2026-11-25', who.staff);
      expect(res.status).toBe(200);
      expect(res.body.roastDate).toBe('2026-11-25');
      expect(res.body.coffees).toEqual([
        {
          coffeeId: cat.coffeeId,
          coffeeName: 'House Espresso',
          totalWeightGrams: 14000,
          orderCount: 2,
        },
      ]);
      expect(res.body.totalWeightGrams).toBe(14000);
    });

    it('is empty for a date with no confirmed orders, and 400 without or with a bad roastDate', async () => {
      const res = await c.get('/orders/roast-summary?roastDate=2027-01-04', who.staff);
      expect(res.body).toEqual({ roastDate: '2027-01-04', coffees: [], totalWeightGrams: 0 });
      expect((await c.get('/orders/roast-summary', who.staff)).status).toBe(400);
      expect((await c.get('/orders/roast-summary?roastDate=bad', who.staff)).status).toBe(400);
    });
  });
});
