import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './errors';

const MAX_RETRIES = 2;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry network and server errors, never client errors (4xx).
      retry: (failureCount, error) =>
        failureCount < MAX_RETRIES &&
        !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});
