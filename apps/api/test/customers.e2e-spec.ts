/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- supertest bodies are untyped JSON */
import request from 'supertest';
import { createTestApp, createUser, login, LoggedIn, TestApp } from './helpers/app';

const api = '/api/v1';
const ABN = '51824753556';
// Second checksum-valid ABN (ATO example: Commonwealth of Australia style test value).
const ABN2 = '53004085616';

const branchBody = {
  name: 'Surry Hills',
  addressLine1: '1 Crown St',
  suburb: 'Surry Hills',
  state: 'NSW',
  postcode: '2010',
};

describe('customers and branches (e2e)', () => {
  let t: TestApp;
  let mgr: LoggedIn;
  let staff: LoggedIn;
  let n = 0;

  const post = (url: string, who: LoggedIn, body?: object) =>
    request(t.server).post(`${api}${url}`).set(who.auth).send(body);
  const patch = (url: string, who: LoggedIn, body: object) =>
    request(t.server).patch(`${api}${url}`).set(who.auth).send(body);
  const get = (url: string, who: LoggedIn = mgr) =>
    request(t.server).get(`${api}${url}`).set(who.auth);
  const mkCustomer = async (extra: Record<string, unknown> = {}) =>
    (await post('/customers', mgr, { legalName: `Cust ${++n}`, billingEmail: 'a@b.com', ...extra }))
      .body;

  beforeAll(async () => {
    t = await createTestApp();
    await createUser(t, { email: 'mgr@example.com', role: 'MANAGER' });
    await createUser(t, { email: 'staff@example.com', role: 'STAFF' });
    mgr = await login(t, 'mgr@example.com');
    staff = await login(t, 'staff@example.com');
  });
  afterAll(() => t.close());

  describe('create', () => {
    it('creates with defaults: active, 14 day terms, null optionals, no branches', async () => {
      const res = await post('/customers', mgr, {
        legalName: 'Bean There Pty Ltd',
        billingEmail: 'ap@bean.com',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        legalName: 'Bean There Pty Ltd',
        tradingName: null,
        displayName: 'Bean There Pty Ltd',
        abn: null,
        phone: null,
        notes: null,
        paymentTermsDays: 14,
        isActive: true,
        deactivatedAt: null,
        activeBranchCount: 0,
        branches: [],
      });
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('trims text, strips ABN spaces, blanks become null, trading name drives displayName', async () => {
      const res = await post('/customers', mgr, {
        legalName: '  Roast Co Pty Ltd  ',
        tradingName: '  Roast Co  ',
        abn: ABN,
        billingEmail: '  Accounts@Roast.com ',
        phone: '   ',
        notes: '',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        legalName: 'Roast Co Pty Ltd',
        tradingName: 'Roast Co',
        displayName: 'Roast Co',
        abn: ABN,
        billingEmail: 'Accounts@Roast.com',
        phone: null,
        notes: null,
      });
    });

    it('stores a spaced ABN as 11 digits', async () => {
      const res = await post('/customers', mgr, {
        legalName: 'Spaced',
        billingEmail: 'a@b.com',
        abn: '53 004 085 616',
      });
      expect(res.status).toBe(201);
      expect(res.body.abn).toBe(ABN2);
    });

    it('accepts payment terms 0 and 90, rejects -1, 91, 1.5 and "x"', async () => {
      for (const days of [0, 90]) {
        const r = await post('/customers', mgr, {
          legalName: `T${days}`,
          billingEmail: 'a@b.com',
          paymentTermsDays: days,
        });
        expect(r.status).toBe(201);
        expect(r.body.paymentTermsDays).toBe(days);
      }
      for (const days of [-1, 91, 1.5, 'x']) {
        const r = await post('/customers', mgr, {
          legalName: 'Bad',
          billingEmail: 'a@b.com',
          paymentTermsDays: days,
        });
        expect(r.status).toBe(400);
        expect(r.body.fieldErrors.map((f: { field: string }) => f.field)).toContain(
          'paymentTermsDays',
        );
      }
    });

    it.each([
      ['missing legalName', { billingEmail: 'a@b.com' }, 'legalName'],
      ['blank legalName', { legalName: '   ', billingEmail: 'a@b.com' }, 'legalName'],
      ['null legalName', { legalName: null, billingEmail: 'a@b.com' }, 'legalName'],
      ['missing billingEmail', { legalName: 'X' }, 'billingEmail'],
      ['invalid billingEmail', { legalName: 'X', billingEmail: 'not-an-email' }, 'billingEmail'],
      ['legalName over 200', { legalName: 'x'.repeat(201), billingEmail: 'a@b.com' }, 'legalName'],
      [
        'notes over 2000',
        { legalName: 'X', billingEmail: 'a@b.com', notes: 'n'.repeat(2001) },
        'notes',
      ],
      [
        'phone over 30',
        { legalName: 'X', billingEmail: 'a@b.com', phone: '1'.repeat(31) },
        'phone',
      ],
    ])('400 VALIDATION_FAILED for %s', async (_l, body, field) => {
      const res = await post('/customers', mgr, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.fieldErrors.map((f: { field: string }) => f.field)).toContain(field);
    });

    it('rejects unknown fields (isActive, id) as whitelistValidation', async () => {
      const res = await post('/customers', mgr, {
        legalName: 'X',
        billingEmail: 'a@b.com',
        isActive: false,
        id: 'x',
      });
      expect(res.status).toBe(400);
      const codes = res.body.fieldErrors.map((f: { code: string }) => f.code);
      expect(codes).toContain('whitelistValidation');
    });

    it.each([
      ['letters', '5182475355a', 'abnFormat', 'ABN must be 11 digits'],
      ['too short', '5182475355', 'abnFormat', 'ABN must be 11 digits'],
      ['too long', '518247535560', 'abnFormat', 'ABN must be 11 digits'],
      ['punctuation', '51-824-753-556', 'abnFormat', 'ABN must be 11 digits'],
      ['bad checksum', '51824753557', 'abnChecksum', "This isn't a valid ABN — check for a typo"],
    ])('ABN %s is rejected with %s', async (_l, abn, code, message) => {
      const res = await post('/customers', mgr, { legalName: 'X', billingEmail: 'a@b.com', abn });
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'abn', code, message })]),
      );
    });

    it('treats a blank ABN as no ABN', async () => {
      const res = await post('/customers', mgr, {
        legalName: 'NoAbn',
        billingEmail: 'a@b.com',
        abn: '  ',
      });
      expect(res.status).toBe(201);
      expect(res.body.abn).toBeNull();
    });
  });

  describe('duplicate ABN', () => {
    it('returns 409 ABN_TAKEN naming the existing customer, including inactive ones', async () => {
      const first = await mkCustomer({
        legalName: 'Original Legal',
        tradingName: 'Original Cafe',
        abn: '12 004 044 937',
      });
      expect(first.abn).toBe('12004044937');
      const dup = await post('/customers', mgr, {
        legalName: 'Dup',
        billingEmail: 'a@b.com',
        abn: '12004044937',
      });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('ABN_TAKEN');
      expect(dup.body.meta).toMatchObject({ customerId: first.id, displayName: 'Original Cafe' });
      expect(dup.body.fieldErrors[0]).toMatchObject({
        field: 'abn',
        code: 'abnTaken',
        message: 'This ABN is already used by Original Cafe',
      });

      await post(`/customers/${first.id}/deactivate`, mgr);
      const dup2 = await post('/customers', mgr, {
        legalName: 'Dup2',
        billingEmail: 'a@b.com',
        abn: '12004044937',
      });
      expect(dup2.status).toBe(409);
    });

    it('does not conflict when re-saving a customer with its own ABN', async () => {
      const c = await mkCustomer();
      const withAbn = await patch(`/customers/${c.id}`, mgr, { abn: '33051775556' });
      expect(withAbn.status).toBe(200);
      const again = await patch(`/customers/${c.id}`, mgr, {
        abn: '33 051 775 556',
        legalName: 'Renamed',
      });
      expect(again.status).toBe(200);
      expect(again.body.legalName).toBe('Renamed');
    });

    it('409s when editing onto another customer ABN', async () => {
      const a = await mkCustomer({ abn: '33102417032' });
      const b = await mkCustomer();
      const res = await patch(`/customers/${b.id}`, mgr, { abn: a.abn });
      expect(res.status).toBe(409);
      expect(res.body.meta.customerId).toBe(a.id);
    });

    it('lets only one of two concurrent creates with the same ABN win', async () => {
      const abn = '83914571673';
      const results = await Promise.all(
        [1, 2].map((i) =>
          post('/customers', mgr, { legalName: `Race ${i}`, billingEmail: 'a@b.com', abn }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });
  });

  describe('roles', () => {
    it('STAFF can read list and detail', async () => {
      const c = await mkCustomer();
      expect((await get('/customers', staff)).status).toBe(200);
      expect((await get(`/customers/${c.id}`, staff)).status).toBe(200);
    });

    it('STAFF gets 403 FORBIDDEN on write endpoints and nothing changes', async () => {
      const c = await mkCustomer({ legalName: 'Untouched' });
      const b = (await post(`/customers/${c.id}/branches`, mgr, branchBody)).body;
      const before = await t.prisma.customer.count();

      expect(
        (await post('/customers', staff, { legalName: 'S', billingEmail: 'a@b.com' })).status,
      ).toBe(403);
      expect((await patch(`/customers/${c.id}`, staff, { legalName: 'Hacked' })).status).toBe(403);
      expect((await post(`/customers/${c.id}/deactivate`, staff)).status).toBe(403);
      expect((await post(`/customers/${c.id}/reactivate`, staff)).status).toBe(403);
      expect((await post(`/customers/${c.id}/branches`, staff, branchBody)).status).toBe(403);
      expect((await post(`/branches/${b.id}/deactivate`, staff)).status).toBe(403);
      expect((await post(`/branches/${b.id}/reactivate`, staff)).status).toBe(403);

      expect(await t.prisma.customer.count()).toBe(before);
      const after = (await get(`/customers/${c.id}`)).body;
      expect(after.legalName).toBe('Untouched');
      expect(after.isActive).toBe(true);
      expect(after.branches[0].isActive).toBe(true);
    });

    it('STAFF 403 carries code FORBIDDEN', async () => {
      const res = await post('/customers', staff, { legalName: 'S', billingEmail: 'a@b.com' });
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('permission is checked before validation: STAFF with a bad body gets 403, not 400', async () => {
      const res = await post('/customers', staff, {});
      expect(res.status).toBe(403);
    });

    it('MANAGER may set payment terms; STAFF cannot even via a customer PATCH', async () => {
      const c = await mkCustomer();
      expect(
        (await patch(`/customers/${c.id}`, mgr, { paymentTermsDays: 30 })).body.paymentTermsDays,
      ).toBe(30);
      const r = await patch(`/customers/${c.id}`, staff, { paymentTermsDays: 7 });
      expect(r.status).toBe(403);
      expect((await get(`/customers/${c.id}`)).body.paymentTermsDays).toBe(30);
    });

    it('STAFF may PATCH branch contact fields only', async () => {
      const c = await mkCustomer();
      const b = (await post(`/customers/${c.id}/branches`, mgr, branchBody)).body;
      const ok = await patch(`/branches/${b.id}`, staff, {
        contactName: 'Sam',
        contactPhone: '0400 000 000',
        deliveryNotes: 'Back lane after 7am',
      });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ contactName: 'Sam', deliveryNotes: 'Back lane after 7am' });

      const mixed = await patch(`/branches/${b.id}`, staff, {
        deliveryNotes: 'changed',
        postcode: '2000',
      });
      expect(mixed.status).toBe(403);
      expect(mixed.body.meta.fields).toEqual(['postcode']);
      const after = (await get(`/customers/${c.id}`)).body.branches[0];
      expect(after.deliveryNotes).toBe('Back lane after 7am');
      expect(after.postcode).toBe('2010');

      for (const field of [
        { name: 'X' },
        { addressLine1: 'X' },
        { suburb: 'X' },
        { state: 'VIC' },
      ]) {
        expect((await patch(`/branches/${b.id}`, staff, field)).status).toBe(403);
      }
    });
  });

  describe('get, update and not found', () => {
    it('returns 404 CUSTOMER_NOT_FOUND for unknown and malformed ids on every route', async () => {
      const unknown = '018f0000-0000-7000-8000-000000000000';
      for (const id of [unknown, 'not-a-uuid', '123']) {
        const g = await get(`/customers/${id}`);
        expect([g.status, g.body.code]).toEqual([404, 'CUSTOMER_NOT_FOUND']);
        expect((await patch(`/customers/${id}`, mgr, { legalName: 'X' })).status).toBe(404);
        expect((await post(`/customers/${id}/deactivate`, mgr)).status).toBe(404);
        expect((await post(`/customers/${id}/reactivate`, mgr)).status).toBe(404);
        expect((await post(`/customers/${id}/branches`, mgr, branchBody)).body.code).toBe(
          'CUSTOMER_NOT_FOUND',
        );
        const b = await patch(`/branches/${id}`, mgr, { name: 'X' });
        expect([b.status, b.body.code]).toEqual([404, 'BRANCH_NOT_FOUND']);
        expect((await post(`/branches/${id}/deactivate`, mgr)).body.code).toBe('BRANCH_NOT_FOUND');
        expect((await post(`/branches/${id}/reactivate`, mgr)).body.code).toBe('BRANCH_NOT_FOUND');
      }
    });

    it('PATCH keeps omitted fields, clears nullable ones with null or blank, rejects null on required', async () => {
      const c = await mkCustomer({
        tradingName: 'Trade',
        phone: '02 9000 0000',
        notes: 'hi',
        paymentTermsDays: 21,
      });
      const r = await patch(`/customers/${c.id}`, mgr, {
        tradingName: null,
        phone: '  ',
        billingEmail: 'new@b.com',
      });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({
        tradingName: null,
        phone: null,
        notes: 'hi',
        paymentTermsDays: 21,
        billingEmail: 'new@b.com',
      });
      for (const body of [
        { legalName: null },
        { legalName: '  ' },
        { billingEmail: null },
        { billingEmail: 'bad' },
      ]) {
        const bad = await patch(`/customers/${c.id}`, mgr, body);
        expect(bad.status).toBe(400);
      }
    });

    it('rejects null and non-numeric paymentTermsDays on PATCH with 400, not 500', async () => {
      const c = await mkCustomer();
      for (const value of [null, 'x', {}, [], true]) {
        const res = await patch(`/customers/${c.id}`, mgr, { paymentTermsDays: value });
        expect([value, res.status]).toEqual([value, 400]);
        expect(res.body.code).toBe('VALIDATION_FAILED');
        expect(res.body.fieldErrors[0].field).toBe('paymentTermsDays');
      }
      expect((await get(`/customers/${c.id}`)).body.paymentTermsDays).toBe(14);
    });

    it('rejects isActive and branches in a PATCH body', async () => {
      const c = await mkCustomer();
      expect((await patch(`/customers/${c.id}`, mgr, { isActive: false })).status).toBe(400);
      expect((await patch(`/customers/${c.id}`, mgr, { branches: [] })).status).toBe(400);
    });

    it('updates updatedAt', async () => {
      const c = await mkCustomer();
      await new Promise((r) => setTimeout(r, 20));
      const r = await patch(`/customers/${c.id}`, mgr, { notes: 'x' });
      expect(Date.parse(r.body.updatedAt)).toBeGreaterThan(Date.parse(c.updatedAt));
      expect(r.body.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    });

    it('exposes no DELETE routes', async () => {
      const c = await mkCustomer();
      expect(
        (await request(t.server).delete(`${api}/customers/${c.id}`).set(mgr.auth)).status,
      ).toBe(404);
    });
  });

  describe('deactivate and reactivate', () => {
    it('customer deactivation is idempotent, keeps the first deactivatedAt, and leaves branches alone', async () => {
      const c = await mkCustomer();
      const b1 = (await post(`/customers/${c.id}/branches`, mgr, branchBody)).body;
      const b2 = (
        await post(`/customers/${c.id}/branches`, mgr, { ...branchBody, name: 'Closed one' })
      ).body;
      await post(`/branches/${b2.id}/deactivate`, mgr);

      const d1 = await post(`/customers/${c.id}/deactivate`, mgr);
      expect(d1.status).toBe(200);
      expect(d1.body.isActive).toBe(false);
      expect(d1.body.deactivatedAt).not.toBeNull();
      await new Promise((r) => setTimeout(r, 20));
      const d2 = await post(`/customers/${c.id}/deactivate`, mgr);
      expect(d2.status).toBe(200);
      expect(d2.body.deactivatedAt).toBe(d1.body.deactivatedAt);

      const detail = (await get(`/customers/${c.id}`)).body;
      expect(detail.branches.find((b: { id: string }) => b.id === b1.id).isActive).toBe(true);
      expect(detail.branches.find((b: { id: string }) => b.id === b2.id).isActive).toBe(false);
      expect(detail.activeBranchCount).toBe(1);

      const r = await post(`/customers/${c.id}/reactivate`, mgr);
      expect(r.body).toMatchObject({ isActive: true, deactivatedAt: null });
      expect((await post(`/customers/${c.id}/reactivate`, mgr)).status).toBe(200);
      const after = (await get(`/customers/${c.id}`)).body;
      expect(after.branches.map((b: { isActive: boolean }) => b.isActive).sort()).toEqual([
        false,
        true,
      ]);
    });

    it('allows editing and adding branches on an inactive customer', async () => {
      const c = await mkCustomer();
      await post(`/customers/${c.id}/deactivate`, mgr);
      expect((await patch(`/customers/${c.id}`, mgr, { billingEmail: 'fixed@b.com' })).status).toBe(
        200,
      );
      expect((await post(`/customers/${c.id}/branches`, mgr, branchBody)).status).toBe(201);
    });

    it('branch (de)activation is idempotent; reactivating under an inactive customer is 409 CUSTOMER_INACTIVE', async () => {
      const c = await mkCustomer();
      const b = (await post(`/customers/${c.id}/branches`, mgr, branchBody)).body;
      const d1 = await post(`/branches/${b.id}/deactivate`, mgr);
      expect(d1.body).toMatchObject({ isActive: false });
      expect(d1.body.deactivatedAt).not.toBeNull();
      const d2 = await post(`/branches/${b.id}/deactivate`, mgr);
      expect(d2.body.deactivatedAt).toBe(d1.body.deactivatedAt);

      await post(`/customers/${c.id}/deactivate`, mgr);
      const blocked = await post(`/branches/${b.id}/reactivate`, mgr);
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('CUSTOMER_INACTIVE');
      expect((await get(`/customers/${c.id}`)).body.branches[0].isActive).toBe(false);

      await post(`/customers/${c.id}/reactivate`, mgr);
      const ok = await post(`/branches/${b.id}/reactivate`, mgr);
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ isActive: true, deactivatedAt: null });
    });

    it('the customer stays active when its last branch is deactivated', async () => {
      const c = await mkCustomer();
      const b = (await post(`/customers/${c.id}/branches`, mgr, branchBody)).body;
      await post(`/branches/${b.id}/deactivate`, mgr);
      const d = (await get(`/customers/${c.id}`)).body;
      expect(d.isActive).toBe(true);
      expect(d.activeBranchCount).toBe(0);
    });
  });

  describe('branches', () => {
    it('creates a branch with trimming and keeps postcode leading zeros', async () => {
      const c = await mkCustomer();
      const res = await post(`/customers/${c.id}/branches`, mgr, {
        name: '  Darwin Waterfront ',
        addressLine1: ' 1 Stuart Hwy',
        addressLine2: '  ',
        suburb: 'Darwin City',
        state: 'NT',
        postcode: ' 0800 ',
        contactName: '',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        customerId: c.id,
        name: 'Darwin Waterfront',
        addressLine1: '1 Stuart Hwy',
        addressLine2: null,
        postcode: '0800',
        contactName: null,
        contactPhone: null,
        deliveryNotes: null,
        isActive: true,
        deactivatedAt: null,
      });
    });

    it.each(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'])(
      'accepts state %s',
      async (state) => {
        const c = await mkCustomer();
        expect(
          (await post(`/customers/${c.id}/branches`, mgr, { ...branchBody, state })).status,
        ).toBe(201);
      },
    );

    it.each([
      ['missing name', { name: undefined }, 'name'],
      ['blank suburb', { suburb: '  ' }, 'suburb'],
      ['missing addressLine1', { addressLine1: undefined }, 'addressLine1'],
      ['bad state', { state: 'NZ' }, 'state'],
      ['lowercase state', { state: 'nsw' }, 'state'],
      ['3 digit postcode', { postcode: '201' }, 'postcode'],
      ['5 digit postcode', { postcode: '20100' }, 'postcode'],
      ['letter postcode', { postcode: '20A0' }, 'postcode'],
      ['numeric postcode', { postcode: 2010 }, 'postcode'],
      ['delivery notes over 2000', { deliveryNotes: 'n'.repeat(2001) }, 'deliveryNotes'],
    ])('400 for %s', async (_l, override, field) => {
      const c = await mkCustomer();
      const res = await post(`/customers/${c.id}/branches`, mgr, { ...branchBody, ...override });
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors.map((f: { field: string }) => f.field)).toContain(field);
    });

    it('postcode error message is "Postcode must be 4 digits"', async () => {
      const c = await mkCustomer();
      const res = await post(`/customers/${c.id}/branches`, mgr, { ...branchBody, postcode: '12' });
      expect(
        res.body.fieldErrors.find((f: { field: string }) => f.field === 'postcode').message,
      ).toBe('Postcode must be 4 digits');
    });

    it('cannot be moved to another customer (customerId rejected) or have isActive set', async () => {
      const a = await mkCustomer();
      const other = await mkCustomer();
      const b = (await post(`/customers/${a.id}/branches`, mgr, branchBody)).body;
      const move = await patch(`/branches/${b.id}`, mgr, { customerId: other.id });
      expect(move.status).toBe(400);
      expect(move.body.fieldErrors[0].code).toBe('whitelistValidation');
      expect((await patch(`/branches/${b.id}`, mgr, { isActive: false })).status).toBe(400);
      expect((await get(`/customers/${other.id}`)).body.branches).toEqual([]);
    });

    it('MANAGER can edit address; required fields cannot be nulled', async () => {
      const c = await mkCustomer();
      const b = (await post(`/customers/${c.id}/branches`, mgr, branchBody)).body;
      const ok = await patch(`/branches/${b.id}`, mgr, {
        suburb: 'Redfern',
        postcode: '2016',
        addressLine2: 'Level 1',
      });
      expect(ok.body).toMatchObject({
        suburb: 'Redfern',
        postcode: '2016',
        addressLine2: 'Level 1',
      });
      expect((await patch(`/branches/${b.id}`, mgr, { name: null })).status).toBe(400);
      expect((await patch(`/branches/${b.id}`, mgr, { postcode: '99' })).status).toBe(400);
    });

    it('lists active branches first, then inactive, each group by name case-insensitively', async () => {
      const c = await mkCustomer();
      const mk = async (name: string) =>
        (await post(`/customers/${c.id}/branches`, mgr, { ...branchBody, name })).body;
      const names = ['zeta', 'Alpha', 'beta', 'Charlie'];
      const made = [];
      for (const nm of names) made.push(await mk(nm));
      await post(`/branches/${made[0].id}/deactivate`, mgr); // zeta
      await post(`/branches/${made[3].id}/deactivate`, mgr); // Charlie
      const d = (await get(`/customers/${c.id}`)).body;
      expect(d.branches.map((b: { name: string }) => b.name)).toEqual([
        'Alpha',
        'beta',
        'Charlie',
        'zeta',
      ]);
      expect(d.branches.map((b: { isActive: boolean }) => b.isActive)).toEqual([
        true,
        true,
        false,
        false,
      ]);
    });
  });
});
