import axios from 'axios';
import { type SessionUser, useAuthStore } from '@/stores/auth.store';
import { API_PREFIX, API_URL } from '../config/env';
import { toApiError } from './errors';
import { queryClient } from './query-client';

/** Response of POST /auth/login and POST /auth/refresh. */
export interface SessionDto {
  accessToken: string;
  /** Seconds until accessToken expires. */
  expiresIn: number;
  /** After this the user must log in again (ISO timestamp). */
  sessionExpiresAt: string;
  user: SessionUser;
}

/**
 * Only /auth/refresh and /auth/logout carry the httpOnly refresh cookie, so only they send
 * credentials, plus the CSRF header the API requires on them.
 */
export const cookieHttp = axios.create({
  baseURL: `${API_URL}${API_PREFIX}`,
  timeout: 15_000,
  withCredentials: true,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});
cookieHttp.interceptors.response.use(undefined, (error: unknown) =>
  Promise.reject(toApiError(error)),
);

/** Refresh a minute before the access token runs out, but never in a tight loop. */
const REFRESH_MARGIN_SECONDS = 60;
const MIN_REFRESH_DELAY_MS = 5_000;

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<void> | null = null;
/** Bumped on every clearSession, so a refresh that was in flight during logout can't revive the session. */
let generation = 0;
let bootstrap: Promise<boolean> | null = null;

export type ExpiredHandler = () => void;
let onExpired: ExpiredHandler = () => {};

/** Lets the router decide where to send the user when the session ends (the login page). */
export function setSessionExpiredHandler(handler: ExpiredHandler): void {
  onExpired = handler;
}

/** Stores a session from login or refresh and schedules the next refresh. */
export function applySession(session: SessionDto): void {
  useAuthStore.getState().setSession(session.accessToken, session.user);
  clearTimeout(refreshTimer);
  const delay = Math.max((session.expiresIn - REFRESH_MARGIN_SECONDS) * 1000, MIN_REFRESH_DELAY_MS);
  refreshTimer = setTimeout(() => {
    refreshSession().catch((error: unknown) => {
      // A network blip is fine: the next request's 401 triggers another refresh.
      if (toApiError(error).status === 401) expireSession();
    });
  }, delay);
}

/** Forgets the session locally: token, user, cached server data and the refresh timer. */
export function clearSession(): void {
  clearTimeout(refreshTimer);
  refreshTimer = undefined;
  generation += 1;
  useAuthStore.getState().clear();
  queryClient.clear();
}

/** The session ended without the user asking (expired, revoked): clear and go to login. */
export function expireSession(): void {
  if (!useAuthStore.getState().accessToken) return;
  clearSession();
  onExpired();
}

/** Single-flight: concurrent callers share one POST /auth/refresh. */
export function refreshSession(): Promise<void> {
  const startedAt = generation;
  inflight ??= cookieHttp
    .post<SessionDto>('/auth/refresh')
    .then(({ data }) => {
      if (startedAt === generation) applySession(data);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Called by the route guard. On first use after a page load, tries the refresh cookie once
 * to restore a session. Resolves to whether the user is logged in.
 */
export function ensureSession(): Promise<boolean> {
  if (useAuthStore.getState().accessToken) return Promise.resolve(true);
  bootstrap ??= refreshSession().then(
    () => true,
    () => false,
  );
  return bootstrap.then((ok) => ok && useAuthStore.getState().accessToken !== null);
}

/** After logout or expiry the page-load check must not run again. */
export function markBootstrapped(): void {
  bootstrap ??= Promise.resolve(false);
}

export async function logoutSession(): Promise<void> {
  try {
    await cookieHttp.post('/auth/logout');
  } catch {
    // Idempotent on the server; failing to reach it must not keep the user logged in locally.
  }
  clearSession();
  markBootstrapped();
}

// Wire types shared with errors.ts, kept together so swapping to generated types is one import change.
export type { ApiErrorBody, FieldError } from './errors';
