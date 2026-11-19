/** API origin without a trailing slash. Empty means same origin (the Vite dev proxy). */
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** Prefix of every business endpoint; matches API_PREFIX in apps/api/src/app.setup.ts. */
export const API_PREFIX = '/api/v1';

/** Business timezone; matches APP_TIMEZONE in the API. */
export const APP_TIMEZONE = 'Australia/Sydney';
