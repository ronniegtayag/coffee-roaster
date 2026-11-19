import { createRouter } from '@tanstack/react-router';
import { queryClient } from '@/shared/api/query-client';
import { routeTree } from './routeTree.gen';

export function createAppRouter() {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // Let TanStack Query decide freshness; the router shouldn't cache loader data on its own.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

export const router = createAppRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
