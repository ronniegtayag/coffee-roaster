/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- supertest bodies are untyped JSON */
import request from 'supertest';
import { createTestApp, createUser, login, LoggedIn, TestApp } from './helpers/app';

const api = '/api/v1';
const ABN = '51824753556';
const branchBody = {
  name: 'Surry Hills',
  addressLine1: '1 Crown St',
  suburb: 'Surry Hills',
  state: 'NSW',
  postcode: '2010',
};

describe('GET /customers (e2e)', () => {
  let l: TestApp;
  let who: LoggedIn;
  const list = (qs = '') => request(l.server).get(`${api}/customers${qs}`).set(who.auth);

  beforeAll(async () => {
    l = await createTestApp();
    await createUser(l, { email: 'lister@example.com', role: 'MANAGER' });
    who = await login(l, 'lister@example.com');
    const mk = (body: object) =>
      request(l.server).post(`${api}/customers`).set(who.auth).send(body);
    const bran = (id: string, body: object) =>
      request(l.server)
        .post(`${api}/customers/${id}/branches`)
        .set(who.auth)
        .send({ ...branchBody, ...body });

    await mk({
      legalName: 'Zebra Pty Ltd',
      tradingName: 'apple cafe',
      billingEmail: 'a@b.com',
      abn: ABN,
    });
    await mk({ legalName: 'Banana Co', billingEmail: 'a@b.com', abn: '53004085616' });
    await mk({ legalName: 'cherry Roasters', billingEmail: 'a@b.com' });
    await mk({ legalName: '100% Organic_Beans', billingEmail: 'a@b.com' });
    const old = (
      await mk({ legalName: 'Dormant Pty Ltd', billingEmail: 'a@b.com', abn: '12004044937' })
    ).body;
    await request(l.server).post(`${api}/customers/${old.id}/deactivate`).set(who.auth);

    const all = (await list('?status=all')).body.items;
    const id = (name: string) => all.find((c: { legalName: string }) => c.legalName === name).id;
    await bran(id('Banana Co'), { name: 'Sydney CBD', suburb: 'Surry Hills', state: 'NSW' });
    await bran(id('Banana Co'), {
      name: 'Old Melbourne',
      suburb: 'Fitzroy',
      state: 'VIC',
      postcode: '3065',
    });
    const closed = (
      await bran(id('cherry Roasters'), {
        name: 'Closed Perth',
        suburb: 'Fremantle',
        state: 'WA',
        postcode: '6160',
      })
    ).body;
    await request(l.server).post(`${api}/branches/${closed.id}/deactivate`).set(who.auth);
    await bran(id('cherry Roasters'), {
      name: 'Open Perth',
      suburb: 'Subiaco',
      state: 'WA',
      postcode: '6008',
    });
  });
  afterAll(() => l.close());

  const names = (res: { body: { items: { legalName: string }[] } }) =>
    res.body.items.map((i) => i.legalName);

  it('defaults to active only, sorted by display name case-insensitively (trading name first)', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(names(res)).toEqual([
      '100% Organic_Beans',
      'Zebra Pty Ltd',
      'Banana Co',
      'cherry Roasters',
    ]);
    expect(res.body).toMatchObject({ page: 1, pageSize: 25, totalItems: 4, totalPages: 1 });
    expect(res.body.items[1].displayName).toBe('apple cafe');
  });

  it('filters by status inactive and all', async () => {
    expect(names(await list('?status=inactive'))).toEqual(['Dormant Pty Ltd']);
    expect((await list('?status=all')).body.totalItems).toBe(5);
  });

  it('reports activeBranchCount counting active branches only', async () => {
    const items = (await list()).body.items;
    const count = (n: string) =>
      items.find((i: { legalName: string }) => i.legalName === n).activeBranchCount;
    expect(count('Banana Co')).toBe(2);
    expect(count('cherry Roasters')).toBe(1);
    expect(count('Zebra Pty Ltd')).toBe(0);
  });

  it('searches names case-insensitively and partially, across trading and legal names', async () => {
    expect(names(await list('?search=APPLE'))).toEqual(['Zebra Pty Ltd']);
    expect(names(await list('?search=zebra'))).toEqual(['Zebra Pty Ltd']);
    expect(names(await list('?search=%20%20ana%20'))).toEqual(['Banana Co']);
  });

  it('searches ABN digits ignoring spaces, by prefix and by contained digits', async () => {
    for (const q of ['51824753556', '51%20824', '51824', '824%20753', '753556']) {
      expect(names(await list(`?search=${q}`))).toContain('Zebra Pty Ltd');
    }
    expect(names(await list('?search=51%20824'))).not.toContain('Banana Co');
  });

  it('does not ABN-match when the term contains letters', async () => {
    expect(names(await list('?search=51824abc'))).toEqual([]);
  });

  it('searches branch name and suburb (active and inactive branches)', async () => {
    expect(names(await list('?search=surry'))).toEqual(['Banana Co']);
    expect(names(await list('?search=Fremantle'))).toEqual(['cherry Roasters']);
    expect(names(await list('?search=old%20melb'))).toEqual(['Banana Co']);
  });

  it('escapes LIKE wildcards % and _ and backslash', async () => {
    expect(names(await list('?search=%25'))).toEqual(['100% Organic_Beans']);
    expect(names(await list('?search=_'))).toEqual(['100% Organic_Beans']);
    expect(names(await list('?search=%5C'))).toEqual([]);
    expect(names(await list('?search=n_n'))).toEqual([]);
  });

  it('treats an empty or whitespace search as no search', async () => {
    expect((await list('?search=')).body.totalItems).toBe(4);
    expect((await list('?search=%20%20')).body.totalItems).toBe(4);
  });

  it('keeps the status filter when searching', async () => {
    expect(names(await list('?search=dormant'))).toEqual([]);
    expect(names(await list('?search=dormant&status=inactive'))).toEqual(['Dormant Pty Ltd']);
    expect(names(await list('?search=dormant&status=all'))).toEqual(['Dormant Pty Ltd']);
  });

  it('does not duplicate a customer matching on several branches', async () => {
    const res = await list('?search=perth');
    expect(names(res)).toEqual(['cherry Roasters']);
    expect(res.body.totalItems).toBe(1);
  });

  it('filters by state using active branches only', async () => {
    expect(names(await list('?state=NSW'))).toEqual(['Banana Co']);
    expect(names(await list('?state=VIC'))).toEqual(['Banana Co']);
    expect(names(await list('?state=WA'))).toEqual(['cherry Roasters']);
    expect(names(await list('?state=QLD'))).toEqual([]);
  });

  it('paginates with real totals and returns empty items past the last page', async () => {
    const p1 = await list('?pageSize=3&page=1');
    const p2 = await list('?pageSize=3&page=2');
    expect(names(p1)).toHaveLength(3);
    expect(names(p2)).toEqual(['cherry Roasters']);
    expect(p1.body).toMatchObject({ totalItems: 4, totalPages: 2, pageSize: 3 });
    const past = await list('?pageSize=3&page=9');
    expect(past.status).toBe(200);
    expect(past.body).toMatchObject({ items: [], page: 9, totalItems: 4, totalPages: 2 });
  });

  it('page=1e300 and page=1000001 are 400 with a field error on page', async () => {
    for (const p of ['1e300', '1000001']) {
      const res = await list(`?page=${p}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.fieldErrors.map((f: { field: string }) => f.field)).toContain('page');
    }
  });

  it('page=1000000 is the largest accepted page and returns empty items', async () => {
    const res = await list('?page=1000000');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], page: 1000000, totalItems: 4 });
  });

  it('returns totalPages 0 when nothing matches', async () => {
    const res = await list('?search=nothingmatchesthis');
    expect(res.body).toMatchObject({ items: [], totalItems: 0, totalPages: 0 });
  });

  it.each([
    'page=0',
    'page=-1',
    'page=abc',
    'page=1.5',
    'page=1e300',
    'page=1000001',
    'page=9007199254740993',
    'page=Infinity',
    'pageSize=1e3',
    'pageSize=0',
    'pageSize=101',
    'status=bogus',
    'state=NZ',
    `search=${'x'.repeat(101)}`,
  ])('returns 400 for %s', async (qs) => {
    const res = await list(`?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('returns list items in the documented shape without detail-only fields', async () => {
    const item = (await list('?search=banana')).body.items[0];
    expect(Object.keys(item).sort()).toEqual(
      [
        'abn',
        'activeBranchCount',
        'billingEmail',
        'displayName',
        'id',
        'isActive',
        'legalName',
        'paymentTermsDays',
        'phone',
        'tradingName',
        'updatedAt',
      ].sort(),
    );
  });
});
