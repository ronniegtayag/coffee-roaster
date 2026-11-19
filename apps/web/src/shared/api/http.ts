import axios, { isAxiosError } from 'axios';
import { useAuthStore } from '@/stores/auth.store';
import { API_PREFIX, API_URL } from '../config/env';
import { toApiError } from './errors';
import { expireSession, refreshSession } from './session';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Set once a request has been replayed after a token refresh, so it is replayed only once. */
    _retried?: boolean;
  }
}

/** Axios instance for business endpoints under /api/v1. Rejects with ApiError. */
export const http = axios.create({
  baseURL: `${API_URL}${API_PREFIX}`,
  timeout: 15_000,
});

/** For endpoints outside /api/v1, such as /health. */
export const rootHttp = axios.create({ baseURL: API_URL || '/', timeout: 15_000 });

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Login failures are answers, not expired sessions. */
function isAuthEndpoint(url: string | undefined): boolean {
  return url?.startsWith('/auth/') ?? false;
}

http.interceptors.response.use(undefined, async (error: unknown) => {
  const apiError = toApiError(error);
  const config = isAxiosError(error) ? error.config : undefined;
  const loggedIn = useAuthStore.getState().accessToken !== null;

  if (apiError.status === 401 && config && loggedIn && !isAuthEndpoint(config.url)) {
    if (config._retried) {
      expireSession();
    } else {
      try {
        await refreshSession();
      } catch (refreshError) {
        // Only a 401 means the session is over; a network error leaves the user logged in.
        if (toApiError(refreshError).status === 401) expireSession();
        return Promise.reject(apiError);
      }
      // The request interceptor attaches the new token.
      return http.request({ ...config, _retried: true });
    }
  }
  return Promise.reject(apiError);
});

rootHttp.interceptors.response.use(undefined, (error: unknown) =>
  Promise.reject(toApiError(error)),
);
