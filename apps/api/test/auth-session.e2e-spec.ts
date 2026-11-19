/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- supertest bodies are untyped JSON */
import request from 'supertest';
import { createTestApp, createUser, CSRF, login, PASSWORD, TestApp } from './helpers/app';

const api = '/api/v1';

function claims(token: string): { sub: string; iat: number; exp: number } {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as {
    sub: string;
    iat: number;
    exp: number;
  };
}

describe('session lifetime and lockout scope (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY: '1' });
    await createUser(t, { email: 'late@example.com', role: 'MANAGER' });
    await createUser(t, { email: 'locked@example.com' });
  });
  afterAll(() => t.close());

  const refresh = (cookie: string) =>
    request(t.server).post(`${api}/auth/refresh`).set(CSRF).set('Cookie', cookie);

  it('caps expiresIn and the token exp at the session end when less than the token lifetime is left', async () => {
    const { cookie } = await login(t, 'late@example.com');
    const endsAt = new Date(Date.now() + 120_000);
    await t.prisma.authSession.updateMany({
      where: { user: { email: 'late@example.com' } },
      data: { expiresAt: endsAt },
    });
    const res = await refresh(cookie);
    expect(res.status).toBe(200);
    expect(res.body.expiresIn).toBeLessThanOrEqual(120);
    expect(res.body.expiresIn).toBeGreaterThan(100);
    expect(res.body.expiresIn).toBeLessThan(900);
    expect(Date.parse(res.body.sessionExpiresAt)).toBe(endsAt.getTime());
    // exp is whole seconds; it must never outlive the session, and may be at most 1 s early.
    const exp = claims(res.body.accessToken).exp;
    const endSec = Math.floor(endsAt.getTime() / 1000);
    expect(exp).toBeLessThanOrEqual(endSec);
    expect(exp).toBeGreaterThanOrEqual(endSec - 1);
  });

  it('uses the full token lifetime when plenty of session is left', async () => {
    const res = await request(t.server)
      .post(`${api}/auth/login`)
      .set(CSRF)
      .send({ email: 'late@example.com', password: PASSWORD });
    expect(res.body.expiresIn).toBe(900);
    const c = claims(res.body.accessToken);
    expect(c.exp - c.iat).toBe(900);
  });

  it('rejects both the access token and the refresh after the session end', async () => {
    const { cookie } = await login(t, 'late@example.com');
    await t.prisma.authSession.updateMany({
      where: { user: { email: 'late@example.com' } },
      data: { expiresAt: new Date(Date.now() + 2_000) },
    });
    const res = await refresh(cookie);
    expect(res.status).toBe(200);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    expect((await request(t.server).get(`${api}/auth/me`).set(auth)).status).toBe(200);

    await new Promise((r) => setTimeout(r, 3_200));

    expect((await request(t.server).get(`${api}/auth/me`).set(auth)).status).toBe(401);
    const again = await refresh(cookie);
    expect(again.status).toBe(401);
    expect(again.body.code).toBe('SESSION_EXPIRED');
  });

  it('locks an email for 15 minutes even from a different IP (intended)', async () => {
    for (let i = 0; i < 5; i++) {
      await request(t.server)
        .post(`${api}/auth/login`)
        .set(CSRF)
        .set('X-Forwarded-For', `10.0.0.${i + 1}`)
        .send({ email: 'locked@example.com', password: 'wrong' });
    }
    const res = await request(t.server)
      .post(`${api}/auth/login`)
      .set(CSRF)
      .set('X-Forwarded-For', '203.0.113.99')
      .send({ email: 'locked@example.com', password: PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TOO_MANY_ATTEMPTS');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(14 * 60);
    // Other emails from the same new IP are not affected.
    const other = await request(t.server)
      .post(`${api}/auth/login`)
      .set(CSRF)
      .set('X-Forwarded-For', '203.0.113.99')
      .send({ email: 'late@example.com', password: PASSWORD });
    expect(other.status).toBe(200);
  });
});
