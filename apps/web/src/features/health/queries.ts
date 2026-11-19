import { queryOptions } from '@tanstack/react-query';
import { getHealth } from './api';

export const healthKeys = {
  all: ['health'] as const,
};

export const healthQuery = queryOptions({
  queryKey: healthKeys.all,
  queryFn: getHealth,
  refetchInterval: 30_000,
  // Show "API unreachable" straight away instead of retrying in the background.
  retry: false,
});
