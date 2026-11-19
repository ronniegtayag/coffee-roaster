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
      JWT_EXPIRES_IN_SECONDS: 3600,
    });
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({ JWT_SECRET: valid.JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('rejects a short JWT_SECRET', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
});
