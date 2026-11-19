import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_TIMEZONE: z.string().default('Australia/Sydney'),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  AUTH_COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  /** Comma-separated allowlist of web origins. Empty means CORS is off (dev uses the Vite proxy). */
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

type ParsedEnv = z.infer<typeof envSchema>;

export type Env = Omit<ParsedEnv, 'AUTH_COOKIE_SECURE' | 'CORS_ORIGINS'> & {
  AUTH_COOKIE_SECURE: boolean;
  CORS_ORIGINS: string[];
};

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  const data = result.data;
  const secure = data.AUTH_COOKIE_SECURE
    ? data.AUTH_COOKIE_SECURE === 'true'
    : data.NODE_ENV === 'production';
  if (data.NODE_ENV === 'production' && data.JWT_SECRET.startsWith('change-me')) {
    throw new Error(
      'Invalid environment configuration:\nJWT_SECRET must be changed from the example value',
    );
  }
  if (data.AUTH_COOKIE_SAMESITE === 'none' && !secure) {
    throw new Error(
      'Invalid environment configuration:\nAUTH_COOKIE_SAMESITE=none requires AUTH_COOKIE_SECURE=true',
    );
  }
  return {
    ...data,
    AUTH_COOKIE_SECURE: secure,
    CORS_ORIGINS: data.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
