/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- supertest bodies are untyped JSON */
import request from 'supertest';
import { createTestApp, createUser, CSRF, login, PASSWORD, TestApp } from './helpers/app';

const api = '/api/v1';

describe('auth (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await createUser(t, { email: 'manager@example.com', role: 'MANAGER', name: 'Mia' });
    await createUser(t, { email: 'gone@example.com', isActive: false });
  });
  afterAll(() => t.close());

  describe('POST /auth/login', () => {
    it('logs in with trimmed, differently cased email and returns session, user and permissions', async () => {
      const res = await request(t.server)
        .post(`${api}/auth/login`)
        .set(CSRF)
        .send({ email: '  Manager@Example.COM ', password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        expiresIn: 900,
        user: { email: 'manager@example.com', name: 'Mia', role: 'MANAGER' },
      });
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user.permissions).toContain('customers:write');
      expect(Date.parse(res.body.sessionExpiresAt)).toBeGreaterThan(Date.now() + 11 * 3600_000);
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('rejects login without X-Requested-With as 403 CSRF_HEADER_MISSING and sets no cookie', async () => {
      const res = await request(t.server)
        .post(`${api}/auth/login`)
        .send({ email: 'manager@example.com', password: PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_HEADER_MISSING');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it.each([
      ['an empty body', {}],
      ['wrong credentials', { email: 'manager@example.com', password: 'nope' }],
      ['an unknown field', { email: 'a@b.com', password: 'x', role: 'ADMIN' }],
    ])(
      'checks the CSRF header before validation or credentials (%s): 403, not 400/401',
      async (_l, body) => {
        const res = await request(t.server).post(`${api}/auth/login`).send(body);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CSRF_HEADER_MISSING');
      },
    );

    it('with the header, an empty login body is 400 VALIDATION_FAILED', async () => {
      const res = await request(t.server).post(`${api}/auth/login`).set(CSRF).send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('does not count header-less logins as failed attempts for throttling', async () => {
      await createUser(t, { email: 'nocsrf@example.com' });
      for (let i = 0; i < 8; i++) {
        await request(t.server)
          .post(`${api}/auth/login`)
          .send({ email: 'nocsrf@example.com', password: 'wrong' });
      }
      const res = await request(t.server)
        .post(`${api}/auth/login`)
        .set(CSRF)
        .send({ email: 'nocsrf@example.com', password: PASSWORD });
      expect(res.status).toBe(200);
    });

    it('sets an httpOnly refresh cookie scoped to /api/v1/auth', async () => {
      const res = await request(t.server)
        .post(`${api}/auth/login`)
        .set(CSRF)
        .send({ email: 'manager@example.com', password: PASSWORD });
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toMatch(/^crm_refresh=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(cookie).toMatch(/SameSite=Lax/i);
    });

    it('stores only a hash of the refresh token', async () => {
      const { cookie } = await login(t, 'manager@example.com');
      const raw = cookie.split('=')[1];
      const rows = await t.prisma.authSession.findMany();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.some((r) => r.tokenHash === raw)).toBe(false);
      expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.tokenHash))).toBe(true);
    });

    it.each([
      ['wrong password', 'manager@example.com', 'nope'],
      ['unknown email', 'nobody@example.com', PASSWORD],
      ['inactive user', 'gone@example.com', PASSWORD],
    ])('returns the same generic 401 for %s', async (_label, email, password) => {
      const res = await request(t.server)
        .post(`${api}/auth/login`)
        .set(CSRF)
        .send({ email, password });
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('returns identical bodies for unknown email and wrong password', async () => {
      const a = await request(t.server)
        .post(`${api}/auth/login`)
        .set(CSRF)
        .send({ email: 'ghost1@example.com', password: 'x' });
      const b = await request(t.server)
        .post(`${api}/auth/login`)
        .set(CSRF)
        .send({ email: 'manager@example.com', password: 'x' });
      expect(a.body).toEqual(b.body);
    });

    it.each([
      ['missing email', { password: 'x' }],
      ['missing password', { email: 'a@b.com' }],
      ['empty password', { email: 'a@b.com', password: '' }],
      ['non-string password', { email: 'a@b.com', password: 123 }],
      ['password over 256 chars', { email: 'a@b.com', password: 'p'.repeat(257) }],
      ['unknown field', { email: 'a@b.com', password: 'x', role: 'ADMIN' }],
    ])('returns 400 with field errors for %s', async (_l, body) => {
      const res = await request(t.server).post(`${api}/auth/login`).set(CSRF).send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.fieldErrors?.length).toBeGreaterThan(0);
    });
  });

  describe('GET /auth/me and the global guard', () => {
    it('returns the current user for a valid token', async () => {
      const { auth } = await login(t, 'manager@example.com');
      const res = await request(t.server).get(`${api}/auth/me`).set(auth);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ email: 'manager@example.com', role: 'MANAGER' });
    });

    it.each([['/auth/me'], ['/customers'], ['/customers/00000000-0000-0000-0000-000000000000']])(
      'rejects GET %s without a token as 401 UNAUTHENTICATED',
      async (p) => {
        const res = await request(t.server).get(`${api}${p}`);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('UNAUTHENTICATED');
      },
    );

    it('rejects garbage and wrongly signed tokens', async () => {
      const bad = await request(t.server)
        .get(`${api}/auth/me`)
        .set('Authorization', 'Bearer not.a.jwt');
      expect(bad.status).toBe(401);
      const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
      const payload = Buffer.from('{"sub":"x"}').toString('base64url');
      const none = await request(t.server)
        .get(`${api}/auth/me`)
        .set('Authorization', `Bearer ${header}.${payload}.`);
      expect(none.status).toBe(401);
    });

    it('keeps /health public', async () => {
      const res = await request(t.server).get('/health');
      expect(res.status).not.toBe(401);
    });

    it('locks out a user deactivated mid-session on their next request', async () => {
      const u = await createUser(t, { email: 'midsession@example.com' });
      const { auth } = await login(t, 'midsession@example.com');
      expect((await request(t.server).get(`${api}/auth/me`).set(auth)).status).toBe(200);
      await t.prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
      const res = await request(t.server).get(`${api}/auth/me`).set(auth);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('applies role changes on the next request', async () => {
      const u = await createUser(t, { email: 'promoted@example.com', role: 'STAFF' });
      const { auth } = await login(t, 'promoted@example.com');
      const body = { legalName: 'Role Change Cafe', billingEmail: 'a@b.com' };
      expect((await request(t.server).post(`${api}/customers`).set(auth).send(body)).status).toBe(
        403,
      );
      await t.prisma.user.update({ where: { id: u.id }, data: { role: 'MANAGER' } });
      expect((await request(t.server).post(`${api}/customers`).set(auth).send(body)).status).toBe(
        201,
      );
    });
  });

  describe('refresh and logout', () => {
    it('refreshes from the cookie with the CSRF header', async () => {
      const { cookie } = await login(t, 'manager@example.com');
      const res = await request(t.server)
        .post(`${api}/auth/refresh`)
        .set(CSRF)
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('manager@example.com');
      const me = await request(t.server)
        .get(`${api}/auth/me`)
        .set('Authorization', `Bearer ${res.body.accessToken}`);
      expect(me.status).toBe(200);
    });

    it('does not extend the fixed session lifetime on refresh', async () => {
      const first = await request(t.server)
        .post(`${api}/auth/login`)
        .set(CSRF)
        .send({ email: 'manager@example.com', password: PASSWORD });
      const cookie = (first.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
      const res = await request(t.server)
        .post(`${api}/auth/refresh`)
        .set(CSRF)
        .set('Cookie', cookie);
      expect(res.body.sessionExpiresAt).toBe(first.body.sessionExpiresAt);
    });

    it.each(['refresh', 'logout'])(
      '%s without X-Requested-With is 403 CSRF_HEADER_MISSING',
      async (a) => {
        const { cookie } = await login(t, 'manager@example.com');
        const res = await request(t.server).post(`${api}/auth/${a}`).set('Cookie', cookie);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CSRF_HEADER_MISSING');
      },
    );

    it('refresh with no cookie is 401 SESSION_EXPIRED', async () => {
      const res = await request(t.server).post(`${api}/auth/refresh`).set(CSRF);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });

    it('refresh with an unknown cookie is 401 SESSION_EXPIRED', async () => {
      const res = await request(t.server)
        .post(`${api}/auth/refresh`)
        .set(CSRF)
        .set('Cookie', 'crm_refresh=bogus');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });

    it('logout returns 204, clears the cookie, and the session can no longer refresh', async () => {
      const { cookie } = await login(t, 'manager@example.com');
      const out = await request(t.server)
        .post(`${api}/auth/logout`)
        .set(CSRF)
        .set('Cookie', cookie);
      expect(out.status).toBe(204);
      expect((out.headers['set-cookie'] as unknown as string[])[0]).toMatch(
        /crm_refresh=;|Expires=Thu, 01 Jan 1970/,
      );
      const res = await request(t.server)
        .post(`${api}/auth/refresh`)
        .set(CSRF)
        .set('Cookie', cookie);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });

    it('logout is idempotent without a cookie or with an unknown one', async () => {
      expect((await request(t.server).post(`${api}/auth/logout`).set(CSRF)).status).toBe(204);
      expect(
        (
          await request(t.server)
            .post(`${api}/auth/logout`)
            .set(CSRF)
            .set('Cookie', 'crm_refresh=x')
        ).status,
      ).toBe(204);
    });

    it('logout revokes only the current session', async () => {
      const a = await login(t, 'manager@example.com');
      const b = await login(t, 'manager@example.com');
      await request(t.server).post(`${api}/auth/logout`).set(CSRF).set('Cookie', a.cookie);
      const res = await request(t.server)
        .post(`${api}/auth/refresh`)
        .set(CSRF)
        .set('Cookie', b.cookie);
      expect(res.status).toBe(200);
    });

    it('cannot refresh a session past its expiresAt even if the cookie is still sent', async () => {
      const { cookie } = await login(t, 'manager@example.com');
      await t.prisma.authSession.updateMany({
        where: { user: { email: 'manager@example.com' } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await request(t.server)
        .post(`${api}/auth/refresh`)
        .set(CSRF)
        .set('Cookie', cookie);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });

    it('refresh for a deactivated user is 401 SESSION_EXPIRED', async () => {
      const u = await createUser(t, { email: 'leaver@example.com' });
      const { cookie } = await login(t, 'leaver@example.com');
      await t.prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
      const res = await request(t.server)
        .post(`${api}/auth/refresh`)
        .set(CSRF)
        .set('Cookie', cookie);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });
  });

  describe('login throttling', () => {
    it('returns 429 with Retry-After on the 6th failure, even with the right password', async () => {
      await createUser(t, { email: 'throttle@example.com' });
      for (let i = 0; i < 5; i++) {
        const r = await request(t.server)
          .post(`${api}/auth/login`)
          .set(CSRF)
          .send({ email: 'Throttle@example.com', password: 'wrong' });
        expect(r.status).toBe(401);
      }
      const res = await request(t.server)
        .post(`${api}/auth/login`)
        .set(CSRF)
        .send({ email: 'throttle@example.com', password: PASSWORD });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('TOO_MANY_ATTEMPTS');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });
  });
});
