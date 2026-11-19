import axios from 'axios';
import { useAuthStore } from '@/stores/auth.store';
import { API_PREFIX, API_URL } from '../config/env';
import { toApiError } from './errors';
import { queryClient } from './query-client';

/** Axios instance for business endpoints under /api/v1. Rejects with ApiError. */
export const http = axios.create({
  baseURL: `${API_URL}${API_PREFIX}`,
  timeout: 15_000,
});

/** For endpoints outside /api/v1, such as /health. */
export const rootHttp = axios.create({ baseURL: API_URL || '/', timeout: 15_000 });

let onUnauthorized: () => void = () => {};

/** Lets the router decide where to send the user after a 401 (e.g. a login page). */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

for (const instance of [http, rootHttp]) {
  instance.interceptors.response.use(undefined, (error: unknown) => {
    const apiError = toApiError(error);
    if (instance === http && apiError.status === 401 && useAuthStore.getState().accessToken) {
      useAuthStore.getState().clear();
      queryClient.clear();
      onUnauthorized();
    }
    return Promise.reject(apiError);
  });
}
