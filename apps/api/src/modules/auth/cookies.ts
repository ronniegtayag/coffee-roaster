import type { Request, Response } from 'express';

export const REFRESH_COOKIE = 'crm_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface RefreshCookieOptions {
  sameSite: 'lax' | 'strict' | 'none';
  secure: boolean;
}

/** Reads one cookie from the Cookie header (avoids a cookie-parser dependency). */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function setRefreshCookie(
  res: Response,
  token: string,
  maxAgeSeconds: number,
  opts: RefreshCookieOptions,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
    sameSite: opts.sameSite,
    secure: opts.secure,
    maxAge: Math.max(0, maxAgeSeconds) * 1000,
  });
}

export function clearRefreshCookie(res: Response, opts: RefreshCookieOptions): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
    sameSite: opts.sameSite,
    secure: opts.secure,
  });
}
