import { validateEnv } from './env';

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://crm:crm@localhost:5432/coffee_crm',
    JWT_SECRET: 'x'.repeat(32),
  };

  it('applies defaults', () => {
    expect(validateEnv(valid)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      APP_TIMEZONE: 'Australia/Sydney',
      JWT_EXPIRES_IN_SECONDS: 900,
      AUTH_SESSION_TTL_HOURS: 12,
      AUTH_COOKIE_SAMESITE: 'lax',
      AUTH_COOKIE_SECURE: false,
      CORS_ORIGINS: [],
      TRUST_PROXY: 0,
    });
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({ JWT_SECRET: valid.JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('rejects a short JWT_SECRET', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('defaults AUTH_COOKIE_SECURE to true in production only', () => {
    expect(validateEnv({ ...valid, NODE_ENV: 'production' }).AUTH_COOKIE_SECURE).toBe(true);
    expect(validateEnv({ ...valid, NODE_ENV: 'development' }).AUTH_COOKIE_SECURE).toBe(false);
    expect(
      validateEnv({ ...valid, NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' })
        .AUTH_COOKIE_SECURE,
    ).toBe(false);
  });

  it('requires secure cookies for SameSite=none', () => {
    expect(() => validateEnv({ ...valid, AUTH_COOKIE_SAMESITE: 'none' })).toThrow(
      /AUTH_COOKIE_SECURE/,
    );
    expect(
      validateEnv({ ...valid, AUTH_COOKIE_SAMESITE: 'none', AUTH_COOKIE_SECURE: 'true' })
        .AUTH_COOKIE_SAMESITE,
    ).toBe('none');
  });

  it('parses CORS_ORIGINS into a trimmed array without blanks', () => {
    expect(
      validateEnv({ ...valid, CORS_ORIGINS: ' http://localhost:5173 , https://app.example.com,, ' })
        .CORS_ORIGINS,
    ).toEqual(['http://localhost:5173', 'https://app.example.com']);
  });

  it('rejects out-of-range session TTL and an invalid SameSite value', () => {
    expect(() => validateEnv({ ...valid, AUTH_SESSION_TTL_HOURS: '0' })).toThrow();
    expect(() => validateEnv({ ...valid, AUTH_SESSION_TTL_HOURS: '169' })).toThrow();
    expect(() => validateEnv({ ...valid, AUTH_COOKIE_SAMESITE: 'weird' })).toThrow();
  });
});
