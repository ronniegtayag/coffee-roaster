import { createRouter } from '@tanstack/react-router';
import { setSessionExpiredHandler } from '@/shared/api/session';
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

// When a session ends on its own, go to login and come back to this page afterwards.
setSessionExpiredHandler(() => {
  if (router.state.location.pathname === '/login') return;
  void router.navigate({
    to: '/login',
    search: { redirect: router.state.location.href, reason: 'expired' },
    replace: true,
  });
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
